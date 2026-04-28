// State Manager con localStorage + IndexedDB fallback
class StateManager {
  constructor() {
    this.STORAGE_KEY = 'racecontrol_state_v1';
    this.DB_NAME = 'RaceControlDB';
    this.DB_VERSION = 1;
    this.db = null;
  }

  async init() {
    // Intentar IndexedDB primero
    if ('indexedDB' in window) {
      try {
        this.db = await this.openDB();
        console.log('✅ IndexedDB disponible');
      } catch (e) {
        console.warn('⚠️ IndexedDB no disponible, usando localStorage');
      }
    }
    
    // Cargar estado existente
    return await this.loadState();
  }

  openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('state')) {
          db.createObjectStore('state', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots', { keyPath: 'snapshot_id' });
        }
      };
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async loadState() {
    const defaultState = {
      meta: { updatedAt: null, version: 1 },
      teams: {},
      drivers: {},
      newsSignals: [],
      weeklySnapshots: []
    };

    if (this.db) {
      // Leer desde IndexedDB
      return await this.getFromIndexedDB('current_state', defaultState);
    } else {
      // Fallback a localStorage
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : defaultState;
    }
  }

  async saveState(state) {
    state.meta.updatedAt = new Date().toISOString();
    
    if (this.db) {
      await this.saveToIndexedDB('current_state', state);
    } else {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    }
    
    return state;
  }

  async getFromIndexedDB(key, defaultValue) {
    return new Promise((resolve) => {
      const tx = this.db.transaction('state', 'readonly');
      const store = tx.objectStore('state');
      const request = store.get(key);
      
      request.onsuccess = () => {
        resolve(request.result?.value || defaultValue);
      };
      request.onerror = () => {
        resolve(defaultValue);
      };
    });
  }

  async saveToIndexedDB(key, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('state', 'readwrite');
      const store = tx.objectStore('state');
      const request = store.put({ id: key, value });
      
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async resetState() {
    const defaultState = {
      meta: { updatedAt: new Date().toISOString(), version: 1 },
      teams: {},
      drivers: {},
      newsSignals: [],
      weeklySnapshots: []
    };
    
    return await this.saveState(defaultState);
  }

  // Snapshot methods para telemetría
  async saveSnapshot(snapshotId, snapshotData) {
    if (this.db) {
      await this.saveToIndexedDB(`snapshot_${snapshotId}`, snapshotData);
    }
    // También guardar en localStorage como backup
    const snapshotsKey = 'racecontrol_snapshots';
    const snapshots = JSON.parse(localStorage.getItem(snapshotsKey) || '{}');
    snapshots[snapshotId] = snapshotData;
    localStorage.setItem(snapshotsKey, JSON.stringify(snapshots));
  }

  async loadSnapshot(snapshotId) {
    if (this.db) {
      const snapshot = await this.getFromIndexedDB(`snapshot_${snapshotId}`, null);
      if (snapshot) return snapshot;
    }
    const snapshots = JSON.parse(localStorage.getItem('racecontrol_snapshots') || '{}');
    return snapshots[snapshotId] || null;
  }
}

export default new StateManager();
