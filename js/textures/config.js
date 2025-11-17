/**
 * Texture configuration: providers, environments, and cache settings.
 */
const TextureConfig = (() => {
    const CACHE_MAX_ITEMS = 50;

    const ENVIRONMENTS = [
        { id: 'forest', name: 'Forest', color: '#2D5016', prompt: 'dense forest canopy, lush foliage' },
        { id: 'water', name: 'Water', color: '#1976D2', prompt: 'rippling blue water, subtle waves' },
        { id: 'mountain', name: 'Mountain', color: '#757575', prompt: 'rocky mountain stone, rugged texture' },
        { id: 'desert', name: 'Desert', color: '#D4A574', prompt: 'wind-sculpted desert sand, dunes' },
        { id: 'stone', name: 'Stone', color: '#4A4A4A', prompt: 'masonry stone floor, weathered cracks' }
    ];

    const PROVIDERS = [
        { id: 'mock', name: 'Mock (Procedural)', default: true },
        { id: 'openai', name: 'OpenAI DALL-E 3' }
    ];

    return {
        CACHE_MAX_ITEMS,
        ENVIRONMENTS,
        PROVIDERS
    };
})();
