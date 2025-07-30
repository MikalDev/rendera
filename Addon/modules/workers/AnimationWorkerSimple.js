(function () {
    'use strict';

    // Simple test worker without any imports
    try {
        console.log('[AnimationWorkerSimple] Worker script starting...');
        // Check if we're in a worker context
        if (typeof self === 'undefined') {
            throw new Error('self is undefined - not in worker context');
        }
        console.log('[AnimationWorkerSimple] Worker context confirmed');
        // Add error handler
        self.addEventListener('error', (event) => {
            console.error('[AnimationWorkerSimple] Worker error event:', event);
        });
        // Add message handler
        self.addEventListener('message', (event) => {
            try {
                console.log('[AnimationWorkerSimple] Message received:', event.data);
                self.postMessage({ type: 'ECHO', data: event.data });
            }
            catch (e) {
                console.error('[AnimationWorkerSimple] Error handling message:', e);
            }
        });
        console.log('[AnimationWorkerSimple] Message handler registered successfully');
        // Send ready message
        self.postMessage({ type: 'WORKER_READY', message: 'Simple worker initialized' });
    }
    catch (e) {
        console.error('[AnimationWorkerSimple] Worker initialization error:', e);
        console.error('[AnimationWorkerSimple] Error stack:', e.stack);
    }

})();
