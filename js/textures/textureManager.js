/**
 * Facade for texture generation with provider switching and cache integration.
 */
const TextureManager = (() => {
    const providers = {
        mock: new MockTextureProvider(),
        openai: new OpenAITextureProvider()
    };
    let activeProvider = providers.mock;

    function setProvider(id) {
        if (providers[id]) {
            activeProvider = providers[id];
        }
        return activeProvider;
    }

    function getProvider(id) {
        return providers[id];
    }

    function hashKey(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        return `tex_${Math.abs(hash)}`;
    }

    async function generateTexture(options) {
        const provider = activeProvider;
        const prompt = options.prompt || '';
        const width = options.width || 1024;
        const height = options.height || 1024;
        const cacheKey = hashKey([prompt, width, height, options.seamless].join('|'));
        const cached = TextureCache.get(cacheKey);
        if (cached) {
            return { ...cached, metadata: { ...cached.metadata, cached: true } };
        }

        const canRun = await provider.isAvailable();
        const runner = canRun ? provider : providers.mock;
        const result = await runner.generateTexture({ ...options, width, height });
        if (result.success) {
            TextureCache.set(cacheKey, result);
        }
        return result;
    }

    function clearCache() {
        TextureCache.clear();
    }

    function cacheStats() {
        return TextureCache.stats();
    }

    return {
        setProvider,
        getProvider,
        generateTexture,
        clearCache,
        cacheStats
    };
})();
