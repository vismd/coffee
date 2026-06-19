const MobileUI = {
    toastRegion: null,

    ensureToastRegion() {
        if (this.toastRegion?.isConnected) return this.toastRegion;
        const region = document.createElement('div');
        region.id = 'toast-region';
        region.className = 'toast-region';
        region.setAttribute('aria-live', 'polite');
        region.setAttribute('aria-atomic', 'true');
        document.body.appendChild(region);
        this.toastRegion = region;
        return region;
    },

    toast(message, options = {}) {
        const { type = 'info', duration = 4000, actionLabel = '', onAction = null } = options;
        const toast = document.createElement('div');
        toast.className = `app-toast app-toast-${type}`;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

        const text = document.createElement('span');
        text.className = 'app-toast-message';
        text.textContent = message;
        toast.appendChild(text);

        let timer;
        const dismiss = () => {
            window.clearTimeout(timer);
            toast.classList.add('is-leaving');
            window.setTimeout(() => toast.remove(), 180);
        };

        if (actionLabel && typeof onAction === 'function') {
            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'app-toast-action';
            action.textContent = actionLabel;
            action.addEventListener('click', async () => {
                action.disabled = true;
                try {
                    await onAction();
                    dismiss();
                } catch (error) {
                    action.disabled = false;
                    console.error('Toast action failed', error);
                }
            });
            toast.appendChild(action);
        }

        this.ensureToastRegion().appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('is-visible'));
        if (duration > 0) timer = window.setTimeout(dismiss, duration);
        return { dismiss, element: toast };
    },

    clearError(input) {
        if (!input) return;
        input.removeAttribute('aria-invalid');
        input.classList.remove('field-invalid');
        const field = input.closest('.form-field') || input.parentElement;
        field?.querySelector('.field-error')?.remove();
    },

    showError(input, message) {
        if (!input) return false;
        this.clearError(input);
        input.setAttribute('aria-invalid', 'true');
        input.classList.add('field-invalid');
        const error = document.createElement('p');
        error.className = 'field-error';
        error.textContent = message;
        const field = input.closest('.form-field') || input.parentElement;
        field.appendChild(error);
        input.focus({ preventScroll: true });
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
    },

    setBusy(button, busy, busyLabel = 'Saving...') {
        if (!button) return;
        if (busy) {
            button.dataset.idleLabel = button.textContent;
            button.textContent = busyLabel;
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
        } else {
            button.textContent = button.dataset.idleLabel || 'Save';
            button.disabled = false;
            button.removeAttribute('aria-busy');
        }
    },

    close(id) {
        const overlay = document.getElementById(id);
        if (!overlay) return;
        const returnFocusId = overlay.dataset.returnFocusId;
        overlay.remove();
        if (returnFocusId) document.getElementById(returnFocusId)?.focus();
    },

    openForm({ id, title, description = '', content, submitLabel = 'Save', onSubmit }) {
        if (document.getElementById(id)) return;
        const active = document.activeElement;
        if (active && !active.id) active.id = `${id}-trigger`;

        const overlay = document.createElement('div');
        overlay.id = id;
        overlay.className = 'modal-overlay mobile-sheet-overlay';
        overlay.dataset.returnFocusId = active?.id || '';
        overlay.innerHTML = `
            <section class="card modal mobile-sheet" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
                <div class="mobile-sheet-handle" aria-hidden="true"></div>
                <h3 id="${id}-title">${title}</h3>
                ${description ? `<p class="mobile-sheet-description">${description}</p>` : ''}
                <form id="${id}-form" novalidate>
                    ${content}
                    <div class="modal-actions mobile-sheet-actions">
                        <button type="button" class="btn-cancel" data-sheet-cancel>Cancel</button>
                        <button type="submit" class="btn-primary">${submitLabel}</button>
                    </div>
                </form>
            </section>`;
        document.body.appendChild(overlay);

        const form = overlay.querySelector('form');
        const close = () => this.close(id);
        overlay.querySelector('[data-sheet-cancel]').addEventListener('click', close);
        overlay.addEventListener('click', event => {
            if (event.target === overlay) close();
        });
        overlay.addEventListener('keydown', event => {
            if (event.key === 'Escape') close();
        });
        form.addEventListener('input', event => this.clearError(event.target));
        form.addEventListener('submit', event => {
            event.preventDefault();
            onSubmit({ form, submitButton: form.querySelector('[type="submit"]'), close });
        });
        window.setTimeout(() => form.querySelector('input, select, textarea')?.focus(), 50);
    }
};
