interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

const pending = ref<PendingConfirm | null>(null);

/** In-app replacement for window.confirm; resolves true only on confirm. */
export function useConfirm() {
  function confirm(options: ConfirmOptions): Promise<boolean> {
    pending.value?.resolve(false);
    return new Promise((resolve) => {
      pending.value = { ...options, resolve };
    });
  }

  function settle(ok: boolean) {
    pending.value?.resolve(ok);
    pending.value = null;
  }

  return { confirm, settle, pending };
}
