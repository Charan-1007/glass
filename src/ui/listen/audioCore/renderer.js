// renderer.js
const listenCapture = require('./listenCapture.js');
const params        = new URLSearchParams(window.location.search);
const isListenView  = params.get('view') === 'listen';


window.pickleGlass = {
    startCapture: listenCapture.startCapture,
    stopCapture: listenCapture.stopCapture,
    isLinux: listenCapture.isLinux,
    isMacOS: listenCapture.isMacOS,
    captureManualScreenshot: listenCapture.captureManualScreenshot,
    hasQueuedScreenshots: listenCapture.hasQueuedScreenshots,
    clearScreenshotQueue: listenCapture.clearScreenshotQueue,
    getScreenshotQueueSize: listenCapture.getScreenshotQueueSize,
};

// Also expose at window level for shortcut service access
window.captureManualScreenshot = listenCapture.captureManualScreenshot;
window.hasQueuedScreenshots = listenCapture.hasQueuedScreenshots;
window.clearScreenshotQueue = listenCapture.clearScreenshotQueue;
window.getScreenshotQueueSize = listenCapture.getScreenshotQueueSize;


window.api.renderer.onChangeListenCaptureState((_event, { status }) => {
    if (!isListenView) {
        console.log('[Renderer] Non-listen view: ignoring capture-state change');
        return;
    }
    if (status === "stop") {
        console.log('[Renderer] Session ended – stopping local capture');
        listenCapture.stopCapture();
    } else {
        console.log('[Renderer] Session initialized – starting local capture');
        listenCapture.startCapture();
    }
});
