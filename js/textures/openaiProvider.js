/**
 * OpenAI DALL-E texture provider.
 */
class OpenAITextureProvider extends BaseTextureProvider {
    constructor() {
        super('openai', 'OpenAI DALL-E');
        this.endpoint = 'https://api.openai.com/v1/images/generations';
        this.supportedSizes = {
            '1024x1024': { width: 1024, height: 1024 },
            '1024x1792': { width: 1024, height: 1792 },
            '1792x1024': { width: 1792, height: 1024 }
        };
    }

    async isAvailable() {
        return Boolean(this.apiKey || (typeof document !== 'undefined' && document.getElementById('openaiKey')?.value));
    }

    setApiKey(key) {
        this.apiKey = key;
    }

    getCapabilities() {
        return {
            sizes: Object.keys(this.supportedSizes),
            models: ['dall-e-3', 'dall-e-2', 'gpt-image-1'],
            qualities: ['standard', 'hd'],
            styles: ['natural', 'vivid', 'default']
        };
    }

    /**
     * Calls OpenAI Images API.
     * @param {Object} options
     * @returns {Promise<TextureResult>}
     */
    async generateTexture(options) {
        const start = performance.now();
        const {
            prompt = '',
            size = '1024x1024',
            model = 'dall-e-3',
            quality = 'standard',
            style = '',
            apiKey
        } = options || {};
        const key = apiKey || this.apiKey;
        if (!key) {
            return { success: false, error: 'Missing API key', metadata: { provider: this.id } };
        }

        const body = {
            model,
            prompt: this.enhancePrompt(prompt),
            size,
            quality,
            n: 1
        };
        if (style) {
            body.style = style;
        }

        try {
            const res = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${key}`
                },
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error?.message || `HTTP ${res.status}`);
            }
            const payload = await res.json();
            const normalized = this.normalizeResponse(payload, size, body.prompt);
            normalized.metadata.generationTime = performance.now() - start;
            return normalized;
        } catch (error) {
            return {
                success: false,
                error: error.message,
                metadata: { provider: this.id }
            };
        }
    }

    enhancePrompt(prompt) {
        return `${prompt}, texture, seamless tileable, top-down view, game asset`;
    }

    normalizeResponse(payload, size, prompt) {
        const data = payload.data?.[0];
        if (!data?.url) {
            return { success: false, error: 'No image returned', metadata: { provider: this.id } };
        }
        const dims = this.supportedSizes[size] || { width: 1024, height: 1024 };
        return {
            success: true,
            imageUrl: data.url,
            metadata: {
                width: dims.width,
                height: dims.height,
                format: 'png',
                seamless: true,
                prompt,
                provider: this.id
            }
        };
    }
}
