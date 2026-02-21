const sqliteRepository = require('./sqlite.repository');
const firebaseRepository = require('./firebase.repository');
const authService = require('../../common/services/authService');

function getBaseRepository() {
    const user = authService.getCurrentUser();
    if (user && user.isLoggedIn) {
        return firebaseRepository;
    }
    return sqliteRepository;
}

const settingsRepositoryAdapter = {
    getPresets: () => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().getPresets(uid);
    },

    getPresetTemplates: () => {
        return getBaseRepository().getPresetTemplates();
    },

    createPreset: (options) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().createPreset({ uid, ...options });
    },

    updatePreset: (id, options) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().updatePreset(id, options, uid);
    },

    deletePreset: (id) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().deletePreset(id, uid);
    },

    getAutoUpdate: () => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().getAutoUpdate(uid);
    },

    setAutoUpdate: (isEnabled) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().setAutoUpdate(uid, isEnabled);
    },

    getResume: () => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().getResume(uid);
    },

    saveResume: (text, filename) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().saveResume(uid, text, filename);
    },

    removeResume: () => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().removeResume(uid);
    },
};

module.exports = settingsRepositoryAdapter;
