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
        for (const fields of fieldSets) {
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
