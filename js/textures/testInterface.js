/**
 * UI driver for texture test harness.
 */
document.addEventListener('DOMContentLoaded', () => {
    const providerSelect = document.getElementById('providerSelect');
    const openaiSettings = document.getElementById('openaiSettings');
    const openaiKey = document.getElementById('openaiKey');
    const openaiModel = document.getElementById('openaiModel');
    const openaiQuality = document.getElementById('openaiQuality');
    const openaiStyle = document.getElementById('openaiStyle');
    const envList = document.getElementById('environmentList');
    const generateApplyBtn = document.getElementById('generateApplyBtn');
    const generateAllBtn = document.getElementById('generateAllBtn');
    const clearCacheBtn = document.getElementById('clearCacheBtn');
    const cacheCount = document.getElementById('cacheCount');
    const cacheQuota = document.getElementById('cacheQuota');
    const statusLog = document.getElementById('statusLog');
    const selectedHexLabel = document.getElementById('selectedHexLabel');
    const selectedEnvLabel = document.getElementById('selectedEnvLabel');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const canvas = document.getElementById('hexCanvas');

    const state = {
        hexes: [],
        offsetX: 0,
        offsetY: 0,
        textures: {},
        selectedHexId: null,
        selectedEnvId: TextureConfig.ENVIRONMENTS[0].id
    };

    function log(message, type = 'info') {
        const item = document.createElement('div');
        item.className = `log-item ${type}`;
        const ts = new Date().toLocaleTimeString();
        item.textContent = `[${ts}] ${message}`;
        statusLog.prepend(item);
    }

    function populateProviders() {
        TextureConfig.PROVIDERS.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            providerSelect.appendChild(opt);
            if (p.default) {
                providerSelect.value = p.id;
                TextureManager.setProvider(p.id);
            }
        });
        providerSelect.addEventListener('change', () => {
            TextureManager.setProvider(providerSelect.value);
            openaiSettings.classList.toggle('hidden', providerSelect.value !== 'openai');
            log(`Provider set to ${providerSelect.selectedOptions[0].textContent}`);
        });
        openaiSettings.classList.toggle('hidden', providerSelect.value !== 'openai');
    }

    function populateEnvironments() {
        TextureConfig.ENVIRONMENTS.forEach((env, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `env-button${idx === 0 ? ' selected' : ''}`;
            btn.dataset.envId = env.id;
            const sw = document.createElement('span');
            sw.className = 'env-swatch';
            sw.style.background = env.color;
            const label = document.createElement('span');
            label.textContent = env.name;
            btn.appendChild(sw);
            btn.appendChild(label);
            btn.addEventListener('click', () => selectEnvironment(env.id));
            envList.appendChild(btn);
        });
    }

    function selectEnvironment(envId) {
        state.selectedEnvId = envId;
        envList.querySelectorAll('.env-button').forEach((btn) => {
            btn.classList.toggle('selected', btn.dataset.envId === envId);
        });
        selectedEnvLabel.textContent = `Env: ${envId}`;
    }

    function updateCacheMeta() {
        const stats = TextureManager.cacheStats();
        cacheCount.textContent = `${stats.count} cached`;
        cacheQuota.textContent = `/ ${stats.max} max`;
    }

    function setLoading(isLoading) {
        loadingOverlay.classList.toggle('hidden', !isLoading);
    }

    function initCanvas() {
        const layout = HexRenderer.layoutGrid(canvas);
        state.hexes = layout.hexes;
        state.offsetX = layout.offsetX;
        state.offsetY = layout.offsetY;
        canvas.width = layout.width;
        canvas.height = layout.height;
        HexRenderer.render(canvas, state);
    }

    async function generateForHex(hexId) {
        const env = TextureConfig.ENVIRONMENTS.find((e) => e.id === state.selectedEnvId) || TextureConfig.ENVIRONMENTS[0];
        const providerId = providerSelect.value;
        if (providerId === 'openai') {
            const provider = TextureManager.getProvider('openai');
            provider.setApiKey(openaiKey.value.trim());
        }
        const prompt = `${env.prompt}`;
        const size = '1024x1024';
        setLoading(true);
        log(`Generating ${env.id} for ${hexId || 'all hexes'} via ${providerId}`, 'info');
        const result = await TextureManager.generateTexture({
            prompt,
            width: 1024,
            height: 1024,
            size,
            model: openaiModel.value,
            quality: openaiQuality.value,
            style: openaiStyle.value,
            baseColor: env.color,
            apiKey: openaiKey.value.trim(),
            seamless: true
        });
        setLoading(false);
        if (result.success && result.imageUrl) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                if (hexId) {
                    state.textures[hexId] = img;
                } else {
                    state.hexes.forEach((hex) => {
                        state.textures[hex.id] = img;
                    });
                }
                HexRenderer.render(canvas, state);
            };
            img.src = result.imageUrl;
            log(`Applied texture (${env.id})${result.metadata.cached ? ' [cache]' : ''}`, 'success');
        } else {
            log(`Error: ${result.error || 'Unknown error'}`, 'error');
        }
        updateCacheMeta();
    }

    async function generateAll() {
        await generateForHex(null);
    }

    function clearCache() {
        TextureManager.clearCache();
        updateCacheMeta();
        log('Cache cleared', 'warning');
    }

    generateApplyBtn.addEventListener('click', () => {
        generateForHex(null);
    });

    generateAllBtn.addEventListener('click', () => {
        generateAll();
    });

    clearCacheBtn.addEventListener('click', clearCache);

    // init
    populateProviders();
    populateEnvironments();
    selectEnvironment(state.selectedEnvId);
    updateCacheMeta();
    initCanvas();
    log('Ready. Mock provider active by default. Grid auto-fills on generate.', 'info');
});
