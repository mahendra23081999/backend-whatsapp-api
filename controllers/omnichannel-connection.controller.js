import { TelegramConnection, FacebookConnection, InstagramConnection, /* TwitterConnection, */ FacebookPage, FacebookLead, FacebookLeadForm, FacebookAdAccount, FacebookAdCampaign, FacebookAdSet, FacebookAd, Setting } from '../models/index.js';
import telegramProvider from '../services/messaging/providers/telegram.provider.js';
import facebookProvider from '../services/messaging/providers/facebook.provider.js';
import instagramProvider from '../services/messaging/providers/instagram.provider.js';
// import twitterProvider from '../services/messaging/providers/twitter.provider.js';
import { fetchAllFacebookPages } from './facebook.controller.js';
import axios from 'axios';
import mongoose from 'mongoose';

const FB_API_VERSION = 'v22.0';

// code -> promise that resolves when the first request using that code has finished
const usedInstagramCodes = new Map();

// Must be byte-identical to Meta App > Instagram > Business login settings > OAuth redirect URIs
const DEFAULT_INSTAGRAM_REDIRECT_URI = 'https://wabot.multiplestack.com/instagram-callback';

const getInstagramRedirectUri = () => {
    let uri = (process.env.INSTAGRAM_REDIRECT_URI || DEFAULT_INSTAGRAM_REDIRECT_URI).trim().replace(/^['"]|['"]$/g, '');
    // If only a domain was configured (e.g. "https://wabot.multiplestack.com"), add the callback path
    try {
        const parsed = new URL(uri);
        if (parsed.pathname === '/' || parsed.pathname === '') {
            uri = `${parsed.origin}/instagram-callback`;
        }
    } catch {
        uri = DEFAULT_INSTAGRAM_REDIRECT_URI;
    }
    return uri;
};

export const connectChannel = async (req, res) => {
    try {
        const { platform, workspace_id } = req.body;
        const userId = req.user.owner_id || req.user.id;

        if (!platform || !workspace_id) {
            return res.status(400).json({ success: false, error: 'platform and workspace_id are required' });
        }

        let connection;

        if (platform === 'telegram') {
            const { bot_token } = req.body;
            if (!bot_token) {
                return res.status(400).json({ success: false, error: 'bot_token is required for telegram' });
            }

            let botDetails;
            try {
                const url = `https://api.telegram.org/bot${bot_token}/getMe`;
                const response = await axios.get(url);
                botDetails = response.data.result;
            } catch (error) {
                return res.status(400).json({ success: false, error: 'Invalid Telegram Bot Token' });
            }

            const existingTelegram = await TelegramConnection.findOne({
                bot_id: botDetails.id.toString(),
                workspace_id: { $ne: workspace_id }
            });
            if (existingTelegram) {
                return res.status(400).json({ success: false, error: 'This Telegram bot is already connected by another user or in another workspace.' });
            }

            const baseUrl = process.env.APP_URL || process.env.FRONTEND_URL;
            if (!baseUrl) {
                return res.status(500).json({ success: false, error: 'APP_URL is not configured in environment variables' });
            }

            const webhookUrl = `${baseUrl}/api/webhook/telegram/${workspace_id}`;
            await telegramProvider.setWebhook(bot_token, webhookUrl);

            connection = await TelegramConnection.findOneAndUpdate(
                { workspace_id },
                {
                    $set: {
                        user_id: userId,
                        workspace_id,
                        bot_token,
                        bot_id: botDetails.id.toString(),
                        bot_username: botDetails.username,
                        bot_name: botDetails.first_name,
                        webhook_url: webhookUrl,
                        is_active: true
                    }
                },
                { upsert: true, new: true }
            );
        } else if (platform === 'facebook') {
            const { access_token } = req.body;
            if (!access_token) {
                return res.status(400).json({ success: false, error: 'access_token is required' });
            }

            const setting = await Setting.findOne();
            let finalToken = access_token;
            if (setting?.app_id && setting?.app_secret) {
                try {
                    const fbExchangeRes = await axios.get(`https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token`, {
                        params: {
                            grant_type: 'fb_exchange_token',
                            client_id: setting.app_id,
                            client_secret: setting.app_secret,
                            fb_exchange_token: finalToken
                        }
                    });
                    finalToken = fbExchangeRes.data.access_token || finalToken;
                } catch (err) {
                    console.warn("Failed to exchange Facebook token in connectChannel:", err.message);
                }
            }

            const meRes = await axios.get(`https://graph.facebook.com/${FB_API_VERSION}/me`, {
                params: { access_token: finalToken, fields: 'id,name,email' }
            });
            const fbUser = meRes.data;

            const existingFacebook = await FacebookConnection.findOne({
                fb_user_id: fbUser.id,
                workspace_id: { $ne: workspace_id }
            });
            if (existingFacebook) {
                return res.status(400).json({ success: false, error: 'This Facebook account is already connected by another user or in another workspace.' });
            }

            const pages = await fetchAllFacebookPages(finalToken, fbUser.id, userId);
            const validPages = pages.filter(p => !!p.access_token);

            connection = await FacebookConnection.findOneAndUpdate(
                { workspace_id },
                {
                    $set: {
                        user_id: userId,
                        workspace_id,
                        is_active: true,
                        fb_user_id: fbUser.id,
                        name: fbUser.name,
                        email: fbUser.email,
                        long_lived_access_token: finalToken,
                        pages: validPages.map(p => ({
                            page_id: p.id,
                            page_name: p.name,
                            page_access_token: p.access_token,
                            is_active: true
                        }))
                    }
                },
                { upsert: true, new: true }
            );

            await FacebookPage.deleteMany({ connection_id: connection._id });

            const pageDocs = validPages.map(p => ({
                user_id: userId,
                workspace_id,
                connection_id: connection._id,
                page_id: p.id,
                page_name: p.name,
                page_access_token: p.access_token,
                category: p.category,
                picture_url: p.picture?.data?.url,
                business_id: p.business?.id || null,
                is_whatsapp_connected: !!p.is_whatsapp_connected,
                is_instagram_connected: !!p.instagram_business_account?.id,
                instagram_username: p.instagram_business_account?.username || null,
                instagram_account_id: p.instagram_business_account?.id || null,
                is_active: true
            }));
            await FacebookPage.insertMany(pageDocs);

            for (const p of validPages) {
                try {
                    await facebookProvider.subscribePageToWebhook(p.id, p.access_token);
                } catch (subErr) {
                    console.error(`[Facebook Connection] Failed to subscribe page ${p.name}:`, subErr.message);
                }
            }
        } else if (platform === 'instagram') {
            const clientRedirectUri = req.body.redirect_uri;
            // Instagram appends "#_" to the code in the redirect URL; it must be stripped before exchange
            const code = typeof req.body.code === 'string' ? req.body.code.trim().replace(/#_$/, '') : req.body.code;
            const igLogTag = `[Instagram Connect][ws=${workspace_id}][user=${userId}]`;
            const mask = (v) => (v ? `${String(v).slice(0, 6)}...${String(v).slice(-4)} (len=${String(v).length})` : String(v));

            // The redirect_uri sent to the token endpoint must be byte-identical to the one registered in
            // Meta App > Instagram > Business login settings. Use the server-configured value instead of
            // trusting whatever the browser sends (origin/www/trailing-slash differences break the exchange).
            const redirect_uri = getInstagramRedirectUri() || clientRedirectUri;

            console.log(`${igLogTag} Step 1: request received ` + JSON.stringify({
                has_code: !!code,
                code: mask(code),
                raw_code_had_hash_suffix: typeof req.body.code === 'string' && /#_$/.test(req.body.code.trim()),
                client_redirect_uri: clientRedirectUri,
                redirect_uri_used: redirect_uri,
                redirect_uri_mismatch: !!clientRedirectUri && clientRedirectUri !== redirect_uri
            }));

            if (!code || !redirect_uri) {
                console.warn(`${igLogTag} Missing code or redirect_uri`);
                return res.status(400).json({ success: false, error: 'code and redirect_uri are required for instagram' });
            }

            // Authorization codes are single-use. If the frontend fires the request twice (e.g. React StrictMode),
            // the second call would fail even though the first succeeded — return the result of the first instead.
            if (usedInstagramCodes.has(code)) {
                console.warn(`${igLogTag} Duplicate request with an already-used code; waiting for first request result`);
                await usedInstagramCodes.get(code).catch(() => {});
                const existing = await InstagramConnection.findOne({ workspace_id });
                if (existing) {
                    return res.status(200).json({ success: true, message: 'Instagram connected successfully!', data: existing });
                }
                return res.status(400).json({ success: false, error: 'This Instagram authorization code was already used. Please try connecting again.' });
            }
            let markCodeDone;
            const codePromise = new Promise((resolve) => { markCodeDone = resolve; });
            usedInstagramCodes.set(code, codePromise);
            setTimeout(() => usedInstagramCodes.delete(code), 10 * 60 * 1000).unref?.();
            res.on('finish', () => markCodeDone());

            const setting = await Setting.findOne();
            console.log(`${igLogTag} Step 2: settings loaded ` + JSON.stringify({
                ig_app_id: setting?.ig_app_id || null,
                has_ig_app_secret: !!setting?.ig_app_secret,
                ig_app_secret: mask(setting?.ig_app_secret)
            }));
            if (!setting?.ig_app_id || !setting?.ig_app_secret) {
                console.warn(`${igLogTag} Instagram App ID or Secret missing in settings`);
                return res.status(400).json({ success: false, error: 'Instagram App ID or Secret missing in settings' });
            }

            const form = new URLSearchParams();
            form.append('client_id', setting.ig_app_id);
            form.append('client_secret', setting.ig_app_secret);
            form.append('grant_type', 'authorization_code');
            form.append('redirect_uri', redirect_uri);
            form.append('code', code);

            let shortLivedToken;
            let igUserId;
            try {
                console.log(`${igLogTag} Step 3: exchanging code at https://api.instagram.com/oauth/access_token`, {
                    client_id: setting.ig_app_id,
                    redirect_uri,
                    code: mask(code)
                });
                const tokenRes = await axios.post('https://api.instagram.com/oauth/access_token', form.toString(), {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });
                shortLivedToken = tokenRes.data.access_token;
                igUserId = tokenRes.data.user_id;
                console.log(`${igLogTag} Step 3 OK: short-lived token received`, {
                    ig_user_id: igUserId,
                    token: mask(shortLivedToken),
                    permissions: tokenRes.data.permissions
                });
            } catch (err) {
                const igError = err.response?.data;
                // Single-line JSON so Cloud Run logging keeps it in one entry
                console.error(`${igLogTag} Step 3 FAILED: token exchange error ` + JSON.stringify({
                    instagram_response: igError || null,
                    http_status: err.response?.status,
                    message: err.message,
                    sent: { client_id: setting.ig_app_id, redirect_uri, code: mask(code) }
                }));
                return res.status(400).json({
                    success: false,
                    error: 'Failed to exchange Instagram authorization code',
                    details: igError?.error_message || igError?.error?.message || err.message,
                    instagram_error: igError || null
                });
            }

            let longLivedToken = shortLivedToken;
            try {
                const igLongLivedRes = await axios.get('https://graph.instagram.com/access_token', {
                    params: {
                        grant_type: 'ig_exchange_token',
                        client_secret: setting.ig_app_secret,
                        access_token: shortLivedToken
                    }
                });
                longLivedToken = igLongLivedRes.data.access_token || shortLivedToken;
                console.log(`${igLogTag} Step 4 OK: long-lived token received`, {
                    token: mask(longLivedToken),
                    expires_in: igLongLivedRes.data.expires_in
                });
            } catch (err) {
                console.warn(`${igLogTag} Step 4 FAILED: long-lived token exchange (continuing with short-lived)`, {
                    http_status: err.response?.status,
                    instagram_response: err.response?.data ? JSON.stringify(err.response.data) : null,
                    message: err.message
                });
            }

            let igUser = { id: igUserId, name: `Instagram Account (ID: ${igUserId})`, username: igUserId };
            try {
                const meResIg = await axios.get(`https://graph.instagram.com/v22.0/me`, {
                    params: { access_token: longLivedToken, fields: 'id,username,name,account_type,user_id' }
                });
                if (meResIg.data) {
                    igUser = {
                        id: meResIg.data.id,
                        global_id: meResIg.data.user_id,
                        name: meResIg.data.name || meResIg.data.username || `Instagram Account (ID: ${igUserId})`,
                        username: meResIg.data.username || igUserId
                    };
                }
                console.log(`${igLogTag} Step 5 OK: profile fetched`, igUser);
            } catch (err2) {
                console.error(`${igLogTag} Step 5 FAILED: profile fetch error`, {
                    http_status: err2.response?.status,
                    instagram_response: err2.response?.data ? JSON.stringify(err2.response.data) : null,
                    message: err2.message
                });
            }

            const existingInstagram = await InstagramConnection.findOne({
                ig_user_id: igUser.id,
                workspace_id: { $ne: workspace_id }
            });
            if (existingInstagram) {
                return res.status(400).json({ success: false, error: 'This Instagram account is already connected by another user or in another workspace.' });
            }

            connection = await InstagramConnection.findOneAndUpdate(
                { workspace_id },
                {
                    $set: {
                        user_id: userId,
                        workspace_id,
                        is_active: true,
                        ig_user_id: igUser.id,
                        global_instagram_account_id: igUser.global_id,
                        username: igUser.username || igUser.name || 'instagram_user',
                        name: igUser.name || igUser.username || 'Instagram Account',
                        access_token: longLivedToken,
                        pages: [{
                            page_id: igUser.id,
                            page_name: igUser.name || 'Instagram Account',
                            page_access_token: longLivedToken,
                            instagram_account_id: igUser.id,
                            global_instagram_account_id: igUser.global_id,
                            instagram_username: igUser.username || 'instagram_user',
                            is_active: true
                        }]
                    }
                },
                { upsert: true, new: true }
            );

            console.log(`${igLogTag} Step 6 OK: connection saved`, { connection_id: connection?._id?.toString() });

            try {
                await instagramProvider.subscribePageToWebhook(igUser.id, longLivedToken);
                console.log(`${igLogTag} Step 7 OK: webhook subscribed`);
            } catch (err) {
                console.error(`${igLogTag} Step 7 FAILED: webhook subscribe for ${igUser.username}:`, err.response?.data ? JSON.stringify(err.response.data) : err.message);
            }
        } else if (platform === 'twitter') {
            return res.status(400).json({ success: false, error: 'Twitter integration is currently disabled.' });
        } else {
            return res.status(400).json({ success: false, error: 'Unsupported platform' });
        }

        res.status(200).json({
            success: true,
            message: `${platform.charAt(0).toUpperCase() + platform.slice(1)} connected successfully!`,
            data: connection
        });
    } catch (error) {
        console.error('Error connecting omnichannel channel:', error);
        res.status(500).json({ success: false, error: 'Failed to connect channel', details: error.message });
    }
};


export const getTwitterConfig = async (req, res) => {
    try {
        const setting = await Setting.findOne();

        if (!setting?.twitter_client_id) {
            return res.status(400).json({ success: false, error: 'Twitter credentials are not configured. Please contact your administrator.' });
        }

        const baseUrl = process.env.APP_URL || process.env.FRONTEND_URL;
        const redirectUri = setting.twitter_redirect_uri || `${baseUrl}/api/social/twitter/callback`;
        const clientId = setting.twitter_client_id;

        const scope = 'dm.read dm.write users.read tweet.read offline.access';

        res.status(200).json({
            success: true,
            data: { clientId, redirectUri, scope }
        });
    } catch (error) {
        console.error('[getTwitterConfig] Error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to get Twitter config' });
    }
};


export const twitterCallback = async (req, res) => {
    const { code, state, error, error_description } = req.query;
    const html = `
        <!DOCTYPE html>
        <html>
          <head><title>Twitter Authorization</title></head>
          <body>
            <script>
              const data = {
                type: 'TWITTER_AUTH_CALLBACK',
                code: ${JSON.stringify(code || null)},
                state: ${JSON.stringify(state || null)},
                error: ${JSON.stringify(error || null)},
                error_description: ${JSON.stringify(error_description || null)}
              };
              if (window.opener) {
                window.opener.postMessage(data, '*');
                setTimeout(() => window.close(), 300);
              } else {
                document.body.innerHTML = '<h2>Authorization complete. You can close this window.</h2>';
              }
            </script>
          </body>
        </html>
    `;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
};

// Build the Facebook entries for the inbox channel list.
// Pages may live in the embedded `pages` array and/or the `facebook_pages` collection
// (the Facebook Connect page writes both, older connections may only have one of them).
// An account with no pages at all is still listed so the inbox matches the "Connected" status shown in settings.
const buildFacebookChannelEntries = async (conns) => {
    const entries = [];
    if (!conns.length) return entries;

    const pageDocs = await FacebookPage.find({
        connection_id: { $in: conns.map(c => c._id) },
        is_active: true
    }).select('connection_id page_id page_name').lean();

    for (const conn of conns) {
        const connectionId = conn._id.toString();
        const seen = new Set();
        const add = (pageId, pageName) => {
            if (!pageId || seen.has(String(pageId))) return;
            seen.add(String(pageId));
            entries.push({
                id: String(pageId),
                name: pageName || 'Facebook Page',
                platform: 'facebook',
                connection_id: connectionId
            });
        };

        (conn.pages || []).filter(p => p.is_active !== false).forEach(p => add(p.page_id, p.page_name));
        pageDocs.filter(p => p.connection_id?.toString() === connectionId).forEach(p => add(p.page_id, p.page_name));

        if (seen.size === 0) {
            entries.push({
                id: conn.fb_user_id || connectionId,
                name: conn.name ? `${conn.name} (no pages)` : 'Facebook (no pages)',
                platform: 'facebook',
                connection_id: connectionId,
                no_pages: true
            });
        }
    }
    return entries;
};

export const getConnectedChannels = async (req, res) => {
    try {
        const { workspace_id, platform } = req.query;
        if (!workspace_id) {
            return res.status(400).json({ success: false, error: 'workspace_id is required' });
        }

        let data = [];
        const connections = [];

        if (platform) {
            const userId = req.user?.owner_id || req.user?.id;
            const query = workspace_id && mongoose.Types.ObjectId.isValid(workspace_id) ? { workspace_id, is_active: true } : { user_id: userId, workspace_id: null, is_active: true };

            if (platform === 'telegram') {
                const conns = await TelegramConnection.find(query).lean();
                conns.forEach(conn => {
                    data.push({ ...conn, platform: 'telegram', telegram: conn });
                    connections.push({
                        id: conn.bot_id || conn._id.toString(),
                        name: conn.bot_name || conn.bot_username || 'Telegram Bot',
                        platform: 'telegram',
                        connection_id: conn._id.toString()
                    });
                });
            } else if (platform === 'facebook') {
                const conns = await FacebookConnection.find(query).lean();
                conns.forEach(conn => {
                    data.push({ ...conn, platform: 'facebook', facebook: conn });
                });
                connections.push(...await buildFacebookChannelEntries(conns));
            } else if (platform === 'instagram') {
                const conns = await InstagramConnection.find(query).lean();
                conns.forEach(conn => {
                    data.push({ ...conn, platform: 'instagram', instagram: conn });
                    (conn.pages || []).forEach(p => {
                        connections.push({
                            id: p.instagram_account_id || p.page_id,
                            name: p.instagram_username || p.page_name || 'Instagram Account',
                            platform: 'instagram',
                            connection_id: conn._id.toString()
                        });
                    });
                });
            } else if (platform === 'twitter') {
            }
        } else {
            const userId = req.user?.owner_id || req.user?.id;
            const query = workspace_id && mongoose.Types.ObjectId.isValid(workspace_id) ? { workspace_id, is_active: true } : { user_id: userId, workspace_id: null, is_active: true };
            const [tgConns, fbConns, igConns] = await Promise.all([

                TelegramConnection.find(query).lean(),
                FacebookConnection.find(query).lean(),
                InstagramConnection.find(query).lean(),
                // TwitterConnection.find(query).lean()
            ]);

            tgConns.forEach(conn => {
                data.push({ ...conn, platform: 'telegram', telegram: conn });
                connections.push({
                    id: conn.bot_id || conn._id.toString(),
                    name: conn.bot_name || conn.bot_username || 'Telegram Bot',
                    platform: 'telegram',
                    connection_id: conn._id.toString()
                });
            });

            fbConns.forEach(conn => {
                data.push({ ...conn, platform: 'facebook', facebook: conn });
            });
            connections.push(...await buildFacebookChannelEntries(fbConns));

            igConns.forEach(conn => {
                data.push({ ...conn, platform: 'instagram', instagram: conn });
                (conn.pages || []).forEach(p => {
                    connections.push({
                        id: p.instagram_account_id || p.page_id,
                        name: p.instagram_username || p.page_name || 'Instagram Account',
                        platform: 'instagram',
                        connection_id: conn._id.toString()
                    });
                });
            });

            // twConns.forEach(conn => {
            //     data.push({ ...conn, platform: 'twitter', twitter: conn });
            //     connections.push({
            //         id: conn.twitter_user_id || conn._id.toString(),
            //         name: conn.username || conn.name || 'Twitter Account',
            //         platform: 'twitter',
            //         connection_id: conn._id.toString()
            //     });
            // });
        }

        res.status(200).json({ success: true, data, connections });
    } catch (error) {
        console.error('Error fetching channels:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch channels' });
    }
};

export const disconnectChannel = async (req, res) => {
    try {
        const { id } = req.params;
        let connection = await TelegramConnection.findById(id);
        let platform = 'telegram';

        if (!connection) {
            connection = await FacebookConnection.findById(id);
            platform = 'facebook';
        }
        if (!connection) {
            connection = await InstagramConnection.findById(id);
            platform = 'instagram';
        }
        // DISABLED: Twitter not working
        // if (!connection) {
        //     connection = await TwitterConnection.findById(id);
        //     platform = 'twitter';
        // }

        if (!connection) {
            return res.status(404).json({ success: false, error: 'Channel connection not found' });
        }

        if (platform === 'telegram' && connection.bot_token) {
            try {
                await telegramProvider.setWebhook(connection.bot_token, '');
            } catch (err) {
                console.warn('Could not remove webhook from telegram:', err.message);
            }
            await TelegramConnection.findByIdAndDelete(id);
        } else if (platform === 'facebook') {
            await FacebookConnection.findByIdAndDelete(id);

            const pages = await FacebookPage.find({ connection_id: id });
            const pageIds = pages.map(p => p._id);
            const formDocs = await FacebookLeadForm.find({ facebook_page_id: { $in: pageIds } });
            const formIds = formDocs.map(f => f._id);

            await FacebookLead.deleteMany({ lead_form_id: { $in: formIds } });
            await FacebookLeadForm.deleteMany({ facebook_page_id: { $in: pageIds } });
            await FacebookPage.deleteMany({ connection_id: id });

            const adAccounts = await FacebookAdAccount.find({ connection_id: id });
            const adAccountIds = adAccounts.map(a => a.ad_account_id);
            if (adAccountIds.length > 0) {
                const campaigns = await FacebookAdCampaign.find({ ad_account_id: { $in: adAccountIds } });
                const campaignIds = campaigns.map(c => c._id);
                
                const adSets = await FacebookAdSet.find({ campaign_id: { $in: campaignIds } });
                const adSetIds = adSets.map(a => a._id);
                
                if (adSetIds.length > 0) {
                    await FacebookAd.deleteMany({ ad_set_id: { $in: adSetIds } });
                }
                if (campaignIds.length > 0) {
                    await FacebookAdSet.deleteMany({ campaign_id: { $in: campaignIds } });
                }
                
                await FacebookAdCampaign.deleteMany({ ad_account_id: { $in: adAccountIds } });
                await FacebookAdAccount.deleteMany({ connection_id: id });
            }
        } else if (platform === 'instagram') {
            await InstagramConnection.findByIdAndDelete(id);
        } else if (platform === 'twitter') {
            // DISABLED: Twitter not working
            // await TwitterConnection.findByIdAndDelete(id);
        }

        res.status(200).json({ success: true, message: `${platform} disconnected successfully` });
    } catch (error) {
        console.error('Error disconnecting channel:', error);
        res.status(500).json({ success: false, error: 'Failed to disconnect channel' });
    }
};

// DISABLED: Twitter not working - getTwitterAuthUrl and handleTwitterCallback commented out
export const getTwitterAuthUrl = async (req, res) => {
    return res.status(400).json({ success: false, error: 'Twitter integration is currently disabled.' });
};

export const handleTwitterCallback = async (req, res) => {
    return res.status(400).json({ success: false, error: 'Twitter integration is currently disabled.' });
};
