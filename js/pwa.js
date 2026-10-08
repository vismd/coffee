(() => {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js').catch(error => {
                console.warn('Service worker registration failed', error);
            });
        });
    }

    let installPrompt = null;
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (standalone) return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
        || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    const installButton = document.createElement('button');
    installButton.id = 'install-app-button';
    installButton.className = 'install-app-button';
    installButton.type = 'button';
    installButton.textContent = 'Install';
    installButton.setAttribute('aria-label', 'Install Coffee on this device');

    const showButton = () => {
        if (!installButton.isConnected) document.querySelector('nav')?.insertBefore(installButton, document.getElementById('theme-toggle'));
        installButton.hidden = false;
    };

    if (isIos) showButton();

    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        installPrompt = event;
        showButton();
    });

    installButton.addEventListener('click', async () => {
        if (installPrompt) {
            installButton.disabled = true;
            await installPrompt.prompt();
            const choice = await installPrompt.userChoice;
            installPrompt = null;
            installButton.disabled = false;
            if (choice.outcome === 'accepted') installButton.hidden = true;
            return;
        }

        MobileUI.openForm({
            id: 'ios-install-modal',
            title: 'Install Coffee',
            description: 'In Safari, tap the Share button, then choose “Add to Home Screen.”',
            submitLabel: 'Got it',
            content: '<p class="install-hint">Coffee will open full-screen from your Home Screen.</p>',
            onSubmit: ({ close }) => close()
        });
    });

    window.addEventListener('appinstalled', () => {
        installPrompt = null;
        installButton.remove();
        MobileUI.toast('Coffee was installed.', { type: 'success' });
    });
})();
