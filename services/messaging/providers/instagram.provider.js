import axios from 'axios';

const FB_API_VERSION = 'v22.0';

const maskToken = (t) => (t ? `${String(t).slice(0, 8)}...${String(t).slice(-4)} (len=${String(t).length})` : String(t));

// Single-line logging (Cloud Run splits multi-line logs) + rethrow with Instagram's real error message
const igPost = async (action, url, payload, pageAccessToken) => {
    const safeUrl = url.replace(/access_token=[^&]+/, 'access_token=' + maskToken(pageAccessToken));
    const tokenType = String(pageAccessToken || '').startsWith('IGAA') ? 'instagram_login(IGAA)' : 'facebook_page_token(EAA)';
    console.log(`[InstagramProvider][${action}] request ` + JSON.stringify({ url: safeUrl, token_type: tokenType, payload }));
    try {
        const response = await axios.post(url, payload);
        console.log(`[InstagramProvider][${action}] OK ` + JSON.stringify(response.data));
        return response.data;
    } catch (error) {
        const igErr = error?.response?.data?.error;
        console.error(`[InstagramProvider][${action}] FAILED ` + JSON.stringify({
            http_status: error?.response?.status,
            instagram_error: error?.response?.data || null,
            message: error.message,
            url: safeUrl,
            token_type: tokenType,
            recipient: payload?.recipient,
            payload
        }));
        if (igErr?.message) {
            error.message = `Instagram API error (code ${igErr.code}${igErr.error_subcode ? ', subcode ' + igErr.error_subcode : ''}): ${igErr.message}`;
            error.instagram_error = igErr;
        }
        throw error;
    }
};

class InstagramProvider {

    async sendTextMessage(pageAccessToken, recipientId, text, options = {}) {
        try {
            const baseUrl = pageAccessToken.startsWith('IGAA') ? 'https://graph.instagram.com' : 'https://graph.facebook.com';
            const url = `${baseUrl}/${FB_API_VERSION}/me/messages?access_token=${pageAccessToken}`;

            const recipientObj = options.reply_to_comment_id
                ? { comment_id: options.reply_to_comment_id }
                : { id: recipientId };

            const payload = {
                recipient: recipientObj,
                message: { text: text }
            };
            if (options.messaging_type) payload.messaging_type = options.messaging_type;
            if (options.tag) payload.tag = options.tag;

            return await igPost('send_text', url, payload, pageAccessToken);
        } catch (error) {
            throw error;
        }
    }

    async sendMediaMessage(pageAccessToken, recipientId, messageType, fileUrl, options = {}) {
        try {
            let igMediaType = 'file';
            if (messageType === 'image') igMediaType = 'image';
            if (messageType === 'video') igMediaType = 'video';
            if (messageType === 'audio') igMediaType = 'audio';

            const url = `${pageAccessToken.startsWith('IGAA') ? 'https://graph.instagram.com' : 'https://graph.facebook.com'}/${FB_API_VERSION}/me/messages?access_token=${pageAccessToken}`;

            const recipientObj = options.reply_to_comment_id
                ? { comment_id: options.reply_to_comment_id }
                : { id: recipientId };

            const payload = {
                recipient: recipientObj,
                message: {
                    attachment: {
                        type: igMediaType,
                        payload: {
                            url: fileUrl,
                            is_reusable: true
                        }
                    }
                }
            };
            if (options.messaging_type) payload.messaging_type = options.messaging_type;
            if (options.tag) payload.tag = options.tag;

            return await igPost('send_media', url, payload, pageAccessToken);
        } catch (error) {
            throw error;
        }
    }

    async sendInteractiveMessage(pageAccessToken, recipientId, text, buttons = [], imageUrl = null, options = {}) {
        try {
            const baseUrl = pageAccessToken.startsWith('IGAA') ? 'https://graph.instagram.com' : 'https://graph.facebook.com';
            const url = `${baseUrl}/${FB_API_VERSION}/me/messages?access_token=${pageAccessToken}`;

            const templateButtons = (buttons || []).slice(0, 3).map(btn => ({
                type: "postback",
                title: (btn.text || btn.title).substring(0, 20),
                payload: btn.id || btn.payload || btn.text || btn.title
            }));

            const normalized = (text || "Message").replace(/\r\n/g, '\n').trim();
            let title = normalized;
            let subtitle = undefined;

            if (normalized.includes('\n\n')) {
                const parts = normalized.split('\n\n');
                title = parts[0].replace(/\n/g, ' ').trim().substring(0, 80);
                subtitle = parts.slice(1).join('\n\n').trim().substring(0, 80);
            } else if (normalized.includes('\n')) {
                const parts = normalized.split('\n');
                title = parts[0].trim().substring(0, 80);
                subtitle = parts.slice(1).join('\n').trim().substring(0, 80);
            } else if (normalized.length > 80) {
                title = normalized.substring(0, 80);
                subtitle = normalized.substring(80, 160);
            } else {
                title = normalized;
            }

            const element = {
                title: title
            };
            if (subtitle) {
                element.subtitle = subtitle;
            }

            if (templateButtons.length > 0) {
                element.buttons = templateButtons;
            }

            if (imageUrl) {
                element.image_url = imageUrl;
            }

            const recipientObj = options.reply_to_comment_id
                ? { comment_id: options.reply_to_comment_id }
                : { id: recipientId };

            const payload = {
                recipient: recipientObj,
                message: {
                    attachment: {
                        type: "template",
                        payload: {
                            template_type: "generic",
                            elements: [element]
                        }
                    }
                }
            };
            if (options.messaging_type) payload.messaging_type = options.messaging_type;
            if (options.tag) payload.tag = options.tag;

            return await igPost('send_interactive', url, payload, pageAccessToken);
        } catch (error) {
            throw error;
        }
    }

    async sendCarouselMessage(pageAccessToken, recipientId, elements, options = {}) {
        try {
            const url = `${pageAccessToken.startsWith('IGAA') ? 'https://graph.instagram.com' : 'https://graph.facebook.com'}/${FB_API_VERSION}/me/messages?access_token=${pageAccessToken}`;

            const recipientObj = options.reply_to_comment_id
                ? { comment_id: options.reply_to_comment_id }
                : { id: recipientId };

            const payload = {
                recipient: recipientObj,
                message: {
                    attachment: {
                        type: "template",
                        payload: {
                            template_type: "generic",
                            elements: elements
                        }
                    }
                }
            };
            if (options.messaging_type) payload.messaging_type = options.messaging_type;
            if (options.tag) payload.tag = options.tag;

            return await igPost('send_carousel', url, payload, pageAccessToken);
        } catch (error) {
            throw error;
        }
    }

    async sendReaction(pageAccessToken, recipientId, messageId, emoji) {
        try {
            const baseUrl = pageAccessToken.startsWith('IGAA') ? 'https://graph.instagram.com' : 'https://graph.facebook.com';
            const url = `${baseUrl}/${FB_API_VERSION}/me/messages?access_token=${pageAccessToken}`;
            const payload = {
                recipient: { id: recipientId },
                sender_action: emoji ? "react" : "unreact",
                payload: {
                    message_id: messageId
                }
            };
            if (emoji) {
                payload.payload.reaction = emoji;
            }

            return await igPost('send_reaction', url, payload, pageAccessToken);
        } catch (error) {
            throw error;
        }
    }

    async subscribePageToWebhook(pageId, pageAccessToken) {
        try {
            const baseUrl = pageAccessToken.startsWith('IGAA') ? 'https://graph.instagram.com' : 'https://graph.facebook.com';
            const url = `${baseUrl}/${FB_API_VERSION}/${pageId}/subscribed_apps`;

            const response = await axios.post(url, null, {
                params: {
                    subscribed_fields: 'messages,messaging_postbacks,message_reactions,messaging_seen,comments',
                    access_token: pageAccessToken
                }
            });
            return response.data;
        } catch (error) {
            console.error('[InstagramProvider] Error subscribing instagram webhook:', JSON.stringify(error?.response?.data || {}) + ' ' + error.message);
            throw error;
        }
    }
}

export default new InstagramProvider();
