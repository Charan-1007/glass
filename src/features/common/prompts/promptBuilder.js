const { profilePrompts } = require('./promptTemplates.js');

let _cachedResumeText = undefined; // undefined = not loaded, null = no resume
let _interviewModeEnabled = false;

async function _getResumeText() {
    if (_cachedResumeText !== undefined) return _cachedResumeText;
    try {
        const settingsService = require('../../settings/settingsService');
        const text = await settingsService.getResumeText();
        _cachedResumeText = text || null;
    } catch (e) {
        console.warn('[PromptBuilder] Could not load resume text:', e.message);
        _cachedResumeText = null;
    }
    return _cachedResumeText;
}

// Call this when resume is updated to bust the cache
function invalidateResumeCache() {
    _cachedResumeText = undefined;
}

function setInterviewMode(enabled) {
    _interviewModeEnabled = !!enabled;
    console.log(`[PromptBuilder] Interview mode ${_interviewModeEnabled ? 'enabled' : 'disabled'}`);
}

function getInterviewMode() {
    return _interviewModeEnabled;
}

function buildSystemPrompt(promptParts, customPrompt = '', googleSearchEnabled = true, resumeText = null) {
    const sections = [promptParts.intro, '\n\n', promptParts.formatRequirements];

    if (googleSearchEnabled) {
        sections.push('\n\n', promptParts.searchUsage);
    }

    let userContext = customPrompt;
    if (resumeText) {
        userContext = (customPrompt ? customPrompt + '\n\n' : '') + 'USER RESUME:\n' + resumeText;
    }

    sections.push('\n\n', promptParts.content, '\n\nUser-provided context\n-----\n', userContext, '\n-----\n\n', promptParts.outputInstructions);

    return sections.join('');
}

async function getSystemPrompt(profile, customPrompt = '', googleSearchEnabled = true) {
    // If interview mode is on, override the profile to use interview_mode prompt
    const effectiveProfile = _interviewModeEnabled ? 'interview_mode' : profile;
    const promptParts = profilePrompts[effectiveProfile] || profilePrompts[profile] || profilePrompts.interview;
    const resumeText = await _getResumeText();
    return buildSystemPrompt(promptParts, customPrompt, googleSearchEnabled, resumeText);
}

module.exports = {
    getSystemPrompt,
    invalidateResumeCache,
    setInterviewMode,
    getInterviewMode,
};
