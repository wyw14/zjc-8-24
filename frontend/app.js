const { createApp, ref, onMounted, computed } = Vue;

const API_BASE = 'http://localhost:3124/api';

createApp({
  setup() {
    const isLoggedIn = ref(false);
    const user = ref(null);
    const token = ref(null);

    const loginForm = ref({ username: '', password: '' });
    const loginLoading = ref(false);
    const loginError = ref('');

    const dreams = ref([]);
    const randomDream = ref(null);
    const monthlyStats = ref({ count: 0, avgLucidity: 0 });

    const now = new Date();
    const selectedYear = ref(now.getFullYear());
    const selectedMonth = ref(now.getMonth() + 1);
    const yearOptions = computed(() => {
      const current = new Date().getFullYear();
      const years = [];
      for (let y = current - 5; y <= current; y++) {
        years.push(y);
      }
      return years;
    });

    const newDream = ref({
      content: '',
      lucidity: 3,
      date: new Date().toISOString().split('T')[0]
    });

    const isPlaying = ref(false);
    let audioContext = null;
    let noiseNode = null;
    let gainNode = null;

    const fileInput = ref(null);
    const previewModal = ref({
      visible: false,
      loading: false,
      importing: false,
      error: '',
      total: 0,
      validCount: 0,
      invalidCount: 0,
      duplicateCount: 0,
      validDreams: [],
      invalidDreams: [],
      duplicateDreams: [],
      activeTab: 'valid'
    });

    const previewTabs = computed(() => [
      { key: 'valid', label: '待导入', count: previewModal.value.validCount },
      { key: 'invalid', label: '无效', count: previewModal.value.invalidCount },
      { key: 'duplicate', label: '重复', count: previewModal.value.duplicateCount }
    ]);

    const currentPreviewList = computed(() => {
      switch (previewModal.value.activeTab) {
        case 'valid': return previewModal.value.validDreams;
        case 'invalid': return previewModal.value.invalidDreams;
        case 'duplicate': return previewModal.value.duplicateDreams;
        default: return [];
      }
    });

    function getInvalidReason(item) {
      if (typeof item !== 'object' || item === null) return '数据格式错误';
      if (typeof item.content !== 'string' || !item.content.trim()) return '缺少梦境内容';
      const lucidity = parseInt(item.lucidity);
      if (isNaN(lucidity) || lucidity < 1 || lucidity > 5) return '清醒度需为1-5的整数';
      if (typeof item.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return '日期格式错误（需为YYYY-MM-DD）';
      return '未知错误';
    }

    function getToken() {
      return localStorage.getItem('dream_token');
    }

    function saveToken(t) {
      localStorage.setItem('dream_token', t);
      token.value = t;
    }

    function clearToken() {
      localStorage.removeItem('dream_token');
      token.value = null;
    }

    function saveUser(u) {
      localStorage.setItem('dream_user', JSON.stringify(u));
      user.value = u;
    }

    function loadUser() {
      const saved = localStorage.getItem('dream_user');
      if (saved) {
        user.value = JSON.parse(saved);
        isLoggedIn.value = true;
      }
    }

    async function apiRequest(url, options = {}) {
      const headers = { 'Content-Type': 'application/json', ...options.headers };
      const t = getToken();
      if (t) {
        headers['Authorization'] = `Bearer ${t}`;
      }

      const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers
      });

      if (response.status === 401 || response.status === 403) {
        clearToken();
        isLoggedIn.value = false;
        user.value = null;
        throw new Error('未登录');
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '请求失败');
      }
      return data;
    }

    async function handleLogin() {
      if (!loginForm.value.username || !loginForm.value.password) {
        loginError.value = '请输入用户名和密码';
        return;
      }

      loginLoading.value = true;
      loginError.value = '';

      try {
        const data = await apiRequest('/login', {
          method: 'POST',
          body: JSON.stringify(loginForm.value)
        });

        saveToken(data.token);
        saveUser(data.user);
        isLoggedIn.value = true;
        loadData();
      } catch (e) {
        loginError.value = e.message;
      } finally {
        loginLoading.value = false;
      }
    }

    function handleLogout() {
      clearToken();
      stopWhiteNoise();
      isLoggedIn.value = false;
      user.value = null;
      dreams.value = [];
      randomDream.value = null;
    }

    async function fetchDreams() {
      try {
        const data = await apiRequest('/dreams');
        dreams.value = data;
      } catch (e) {
        console.error('获取梦境列表失败', e);
      }
    }

    async function fetchRandomDream() {
      try {
        const data = await apiRequest('/dreams/random');
        randomDream.value = data;
        if (!isPlaying.value) {
          startWhiteNoise();
          setTimeout(() => {
            stopWhiteNoise();
          }, 12000);
        }
      } catch (e) {
        alert(e.message);
      }
    }

    async function fetchMonthlyStats() {
      try {
        const data = await apiRequest(`/stats/monthly?year=${selectedYear.value}&month=${selectedMonth.value}`);
        monthlyStats.value = data;
      } catch (e) {
        console.error('获取月度统计失败', e);
      }
    }

    function onMonthChange() {
      fetchMonthlyStats();
    }

    async function addDream() {
      if (!newDream.value.content.trim()) {
        alert('请输入梦境内容');
        return;
      }

      try {
        await apiRequest('/dreams', {
          method: 'POST',
          body: JSON.stringify(newDream.value)
        });

        newDream.value = {
          content: '',
          lucidity: 3,
          date: new Date().toISOString().split('T')[0]
        };

        loadData();
      } catch (e) {
        alert(e.message);
      }
    }

    function loadData() {
      fetchDreams();
      fetchMonthlyStats();
    }

    function triggerFileInput() {
      if (fileInput.value) {
        fileInput.value.value = '';
        fileInput.value.click();
      }
    }

    function onFileChange(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      previewDreams(file);
    }

    async function previewDreams(file) {
      previewModal.value.visible = true;
      previewModal.value.loading = true;
      previewModal.value.error = '';
      previewModal.value.activeTab = 'valid';
      previewModal.value.validDreams = [];
      previewModal.value.invalidDreams = [];
      previewModal.value.duplicateDreams = [];

      try {
        const text = await file.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          throw new Error('JSON解析失败，请检查文件格式');
        }

        let dreamsArray = Array.isArray(parsed) ? parsed : parsed.dreams;
        if (!Array.isArray(dreamsArray)) {
          throw new Error('JSON格式错误，根节点需为数组格式');
        }

        const data = await apiRequest('/dreams/preview', {
          method: 'POST',
          body: JSON.stringify({ dreams: dreamsArray })
        });

        previewModal.value.total = data.total;
        previewModal.value.validCount = data.validCount;
        previewModal.value.invalidCount = data.invalidCount;
        previewModal.value.duplicateCount = data.duplicateCount;
        previewModal.value.validDreams = data.validDreams;
        previewModal.value.invalidDreams = data.invalidDreams;
        previewModal.value.duplicateDreams = data.duplicateDreams;
      } catch (e) {
        previewModal.value.error = e.message;
      } finally {
        previewModal.value.loading = false;
      }
    }

    function closePreviewModal() {
      previewModal.value.visible = false;
      previewModal.value.error = '';
      if (fileInput.value) {
        fileInput.value.value = '';
      }
    }

    async function confirmImport() {
      previewModal.value.importing = true;
      try {
        const result = await apiRequest('/dreams/confirm', {
          method: 'POST',
          body: JSON.stringify({ validDreams: previewModal.value.validDreams })
        });
        alert(`成功导入 ${result.imported} 条梦境`);
        closePreviewModal();
        loadData();
      } catch (e) {
        alert(e.message);
      } finally {
        previewModal.value.importing = false;
      }
    }

    function createWhiteNoise() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContext();

      const bufferSize = 2 * audioContext.sampleRate;
      const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
      const output = noiseBuffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      noiseNode = audioContext.createBufferSource();
      noiseNode.buffer = noiseBuffer;
      noiseNode.loop = true;

      gainNode = audioContext.createGain();
      gainNode.gain.value = 0.05;

      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1000;

      noiseNode.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(audioContext.destination);

      noiseNode.start();
    }

    function toggleWhiteNoise() {
      if (isPlaying.value) {
        stopWhiteNoise();
      } else {
        startWhiteNoise();
      }
    }

    function startWhiteNoise() {
      if (!audioContext) {
        createWhiteNoise();
      } else if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      if (gainNode) {
        gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
      }
      isPlaying.value = true;
    }

    function stopWhiteNoise() {
      if (gainNode && audioContext) {
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      }
      isPlaying.value = false;
    }

    onMounted(() => {
      loadUser();
      if (isLoggedIn.value) {
        loadData();
      }
    });

    return {
      isLoggedIn,
      user,
      loginForm,
      loginLoading,
      loginError,
      handleLogin,
      handleLogout,
      dreams,
      randomDream,
      monthlyStats,
      newDream,
      fetchRandomDream,
      addDream,
      isPlaying,
      toggleWhiteNoise,
      selectedYear,
      selectedMonth,
      yearOptions,
      onMonthChange,
      fileInput,
      triggerFileInput,
      onFileChange,
      previewModal,
      previewTabs,
      currentPreviewList,
      getInvalidReason,
      closePreviewModal,
      confirmImport
    };
  }
}).mount('#app');
