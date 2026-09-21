import { CheckCircle2, Download, Share, Smartphone } from 'lucide-react';
import { usePwaInstall } from '@/lib/pwa';
import { Button, Card } from './ui';
import { useToast } from './Toast';

export function InstallAppCard() {
  const pwa = usePwaInstall();
  const toast = useToast();

  return (
    <Card title="Install Lar" icon={Smartphone}>
      {pwa.installed ? (
        <div className="install-state">
          <CheckCircle2 className="success" />
          <div>
            <b>Lar is installed on this device</b>
            <p className="muted">Open it from your home screen or app launcher.</p>
          </div>
        </div>
      ) : !pwa.isSecure ? (
        <div className="install-state">
          <Smartphone />
          <div>
            <b>Open the secure address first</b>
            <p className="muted">
              Open Lar's HTTPS address on your phone. Installation is unavailable from a plain local IP address in most browsers.
            </p>
          </div>
        </div>
      ) : pwa.canPrompt ? (
        <div className="install-state">
          <Download />
          <div className="grow">
            <b>Install Lar on this device</b>
            <p className="muted">It gets its own icon and opens without the browser controls.</p>
          </div>
          <Button
            variant="primary"
            icon={Download}
            onClick={async () => {
              if (await pwa.install()) toast('Lar added to your device');
            }}
          >
            Install
          </Button>
        </div>
      ) : pwa.isIos ? (
        <div className="install-state">
          <Share />
          <div>
            <b>Add Lar on iPhone or iPad</b>
            <p className="muted">Tap the browser’s <strong>Share</strong> button, choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</p>
          </div>
        </div>
      ) : (
        <div className="install-state">
          <Smartphone />
          <div>
            <b>Install from your browser menu</b>
            <p className="muted">In Chrome or Samsung Internet, open the menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>
          </div>
        </div>
      )}
    </Card>
  );
}
