import axios from 'axios';

const FB_API_VERSION = 'v22.0';

class FacebookProvider {

    async sendTextMessage(pageAccessToken, recipientId, text, options = {}) {
        try {
            const url = `https://graph.facebook.com/${FB_API_VERSION}/me/messages?access_token=${pageAccessToken}`;
            const recipientObj = options.reply_to_comment_id 
                ? { comment_id: options.reply_to_comment_id } 
                : { id: recipientId };

            const payload = {
                recipient: recipientObj,
                message: { text: text }
            };
            if (options.messaging_type) payload.messaging_type = options.messaging_type;
            if (options.tag) payload.tag = options.tag;
            
            const response = await axios.post(url, payload);
            return response.data;
        } catch (error) {
            console.error('[FacebookProvider] Error sending message:', JSON.stringify(error?.response?.data || {}, null, 2) || error.message);
            throw error;
        }
    }

    async sendMediaMessage(pageAccessToken, recipientId, messageType, fileUrl, options = {}) {
        try {
            let fbMediaType = 'file';
            if (messageType === 'image') fbMediaType = 'image';
            if (messageType === 'video') fbMediaType = 'video';
            if (messageType === 'audio') fbMediaType = 'audio';

            const url = `https://graph.facebook.com/${FB_API_VERSION}/me/messages?access_token=${pageAccessToken}`;
            const recipientObj = options.reply_to_comment_id 
                ? { comment_id: options.reply_to_comment_id } 
                : { id: recipientId };

            const payload = {
                recipient: recipientObj,
                message: {
                    attachment: {
                        type: fbMediaType,
                        payload: {
                            url: fileUrl,
                            is_reusable: true
                        }
                    }
                }
            };
            if (options.messaging_type) payload.messaging_type = options.messaging_type;
            if (options.tag) payload.tag = options.tag;
            
            const response = await axios.post(url, payload);
            return response.data;
        } catch (error) {
            console.error(`[FacebookProvider] Error sending ${messageType}:`, JSON.stringify(error?.response?.data || {}, null, 2) || error.message);
            throw error;
        }
    }

    async sendInteractiveMessage(pageAccessToken, recipientId, text, buttons = [], imageUrl = null, options = {}) {
        try {
            const url = `https://graph.facebook.com/${FB_API_VERSION}/me/messages?access_token=${pageAccessToken}`;
            
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
            
            const response = await axios.post(url, payload);
            return response.data;
        } catch (error) {
            console.error('[FacebookProvider] Error sending interactive message:', JSON.stringify(error?.response?.data || {}, null, 2) || error.message);
            throw error;
        }
    }

    async sendCarouselMessage(pageAccessToken, recipientId, elements, options = {}) {
        try {
            const url = `https://graph.facebook.com/${FB_API_VERSION}/me/messages?access_token=${pageAccessToken}`;
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
            
            const response = await axios.post(url, payload);
            return response.data;
        } catch (error) {
            console.error('[FacebookProvider] Error sending carousel message:', JSON.stringify(error?.response?.data || {}, null, 2) || error.message);
            throw error;
        }
    }

    async sendReaction(pageAccessToken, recipientId, messageId, emoji) {
        try {
            const url = `https://graph.facebook.com/${FB_API_VERSION}/me/messages?access_token=${pageAccessToken}`;
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
            
            const response = await axios.post(url, payload);
            return response.data;
        } catch (error) {
            console.error('[FacebookProvider] Error sending reaction:', JSON.stringify(error?.response?.data || {}, null, 2) || error.message);
            throw error;
        }
    }

    async subscribePageToWebhook(pageId, pageAccessToken) {
        const url = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}/subscribed_apps`;
        // Meta rejects the whole request if any single field lacks permission (e.g. leadgen needs
        // leads_retrieval, feed needs pages_manage_metadata). Try the full set first, then fall back
        // to progressively smaller sets so incoming messages still get subscribed.
        const fieldSets = [
            'leadgen,messages,messaging_postbacks,message_reactions,feed',
            'messages,messaging_postbacks,message_reactions,feed',
            'messages,messaging_postbacks,message_reactions',
            'messages'
        ];
        let lastError;
        let existing = [];
        try {
            const subs = await this.getPageSubscriptions(pageId, pageAccessToken);
            existing = subs.flatMap(s => (s.subscribed_fields || []).map(f => (typeof f === 'string' ? f : f?.name)).filter(Boolean));
        } catch (_) { /* non-fatal: fall through to the plain field sets */ }

        // Keep fields that are already subscribed (e.g. comments added by Instagram) so we don't drop them;
        // fall back to the plain sets if an existing field is rejected.
        const attempts = [...new Set([
            ...fieldSets.map(base => [...new Set([...base.split(','), ...existing])].join(',')),
            ...fieldSets
        ])];
        for (const fields of attempts) {
            try {
                const response = await axios.post(url, null, {
                    params: { subscribed_fields: fields, access_token: pageAccessToken }
                });
                console.log(`[FacebookProvider] Page ${pageId} subscribed to webhook fields: ${fields}`, JSON.stringify(response.data));
                return response.data;
            } catch (error) {
                lastError = error;
                console.error(`[FacebookProvider] Subscribe page ${pageId} with fields "${fields}" FAILED:`, JSON.stringify(error?.response?.data || { message: error.message }));
            }
        }
        console.error(`[FacebookProvider] Page ${pageId} could NOT be subscribed to any webhook fields — incoming Facebook messages will not arrive. Check the page token has pages_messaging + pages_manage_metadata.`);
        throw lastError;
    }

    /**
     * Add webhook fields to a page subscription WITHOUT removing the ones already there.
     * Meta's POST /{page}/subscribed_apps REPLACES the field list, so posting only "leadgen"
     * silently drops "messages" and incoming Facebook messages stop arriving.
     */
    async addPageSubscriptionFields(pageId, pageAccessToken, fields = []) {
        const url = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}/subscribed_apps`;
        const wanted = Array.isArray(fields) ? fields : String(fields).split(',').map(f => f.trim()).filter(Boolean);

        let existing = [];
        try {
            const subs = await this.getPageSubscriptions(pageId, pageAccessToken);
            existing = subs.flatMap(s => (s.subscribed_fields || []).map(f => (typeof f === 'string' ? f : f?.name)).filter(Boolean));
            console.log(`[FacebookProvider] Page ${pageId} current webhook fields: ${existing.join(',') || '(none)'}`);
        } catch (error) {
            console.warn(`[FacebookProvider] Could not read current subscriptions for page ${pageId}:`, JSON.stringify(error?.response?.data || { message: error.message }));
        }

        const uniq = arr => [...new Set(arr)];
        const messagingFields = ['messages', 'messaging_postbacks', 'message_reactions'];
        const attempts = uniq([
            uniq([...existing, ...wanted]).join(','),
            uniq([...wanted, ...existing.filter(f => messagingFields.includes(f))]).join(','),
            uniq(wanted).join(',')
        ].filter(Boolean));

        let lastError;
        for (const fieldList of attempts) {
            try {
                const response = await axios.post(url, null, {
                    params: { subscribed_fields: fieldList, access_token: pageAccessToken }
                });
                console.log(`[FacebookProvider] Page ${pageId} subscribed to webhook fields: ${fieldList}`, JSON.stringify(response.data));
                if (existing.includes('messages') && !fieldList.split(',').includes('messages')) {
                    console.warn(`[FacebookProvider] Page ${pageId} LOST the "messages" subscription — incoming Facebook messages will stop. Re-sync the page from Facebook Connect.`);
                }
                return response.data;
            } catch (error) {
                lastError = error;
                console.error(`[FacebookProvider] Subscribe page ${pageId} with fields "${fieldList}" FAILED:`, JSON.stringify(error?.response?.data || { message: error.message }));
            }
        }
        throw lastError;
    }

    async getPageSubscriptions(pageId, pageAccessToken) {
        const url = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}/subscribed_apps`;
        const response = await axios.get(url, { params: { access_token: pageAccessToken } });
        return response.data?.data || [];
    }
    async unsubscribePageToWebhook(pageId, pageAccessToken) {
        try {
            const url = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}/subscribed_apps`;
            const response = await axios.delete(url, {
                params: {
                    access_token: pageAccessToken
                }
            });
            return response.data;
        } catch (error) {
             console.error('[FacebookProvider] Error unsubscribing page:', JSON.stringify(error?.response?.data || {}, null, 2) || error.message);
             throw error;
        }
    }
}

export default new FacebookProvider();
