import '../../../style/mobiletools.css';
import { ControlMessage } from '../../controlMessage/ControlMessage';
import { CommandControlMessage } from '../../controlMessage/CommandControlMessage';
import { KeyCodeControlMessage } from '../../controlMessage/KeyCodeControlMessage';
import { TextControlMessage } from '../../controlMessage/TextControlMessage';
import DeviceMessage from '../DeviceMessage';
import KeyEvent from '../android/KeyEvent';
import SvgImage, { Icon } from '../../ui/SvgImage';

export interface MobileFloatingToolsListener {
    sendMessage: (message: ControlMessage) => void;
    disconnect: () => void;
}

type StoredPosition = {
    left: number;
    top: number;
};

export default class MobileFloatingTools {
    private static readonly positionStorageKey = 'ws-scrcpy.mobile-tools.position';
    private readonly root: HTMLElement;
    private readonly panel: HTMLElement;
    private readonly backdrop: HTMLElement;
    private readonly backButton: HTMLButtonElement;
    private readonly toggleButton: HTMLButtonElement;
    private readonly fullscreenButton: HTMLButtonElement;
    private readonly textInput: HTMLTextAreaElement;
    private readonly clipboardInput: HTMLTextAreaElement;
    private readonly status: HTMLElement;
    private readonly container: HTMLElement;
    private readonly listener: MobileFloatingToolsListener;
    private pointerId?: number;
    private pointerStart?: { x: number; y: number };
    private buttonStart?: { left: number; top: number };
    private moved = false;

    public constructor(container: HTMLElement, listener: MobileFloatingToolsListener) {
        this.container = container;
        this.listener = listener;
        this.root = document.createElement('div');
        this.root.className = 'mobile-floating-tools';

        this.backdrop = document.createElement('div');
        this.backdrop.className = 'mobile-floating-tools__backdrop';
        this.backdrop.addEventListener('click', this.closePanel);

        this.panel = document.createElement('section');
        this.panel.className = 'mobile-floating-tools__panel';
        this.panel.setAttribute('aria-label', 'Remote device tools');
        this.panel.addEventListener('pointerdown', (event) => event.stopPropagation());

        const header = document.createElement('div');
        header.className = 'mobile-floating-tools__header';
        const title = document.createElement('strong');
        title.innerText = 'Remote tools';
        const closeButton = this.createIconButton('Close tools', Icon.CANCEL);
        closeButton.addEventListener('click', this.closePanel);
        header.appendChild(title);
        header.appendChild(closeButton);
        this.panel.appendChild(header);

        const textSection = document.createElement('div');
        textSection.className = 'mobile-floating-tools__section';
        const textLabel = document.createElement('label');
        textLabel.innerText = 'Send text to Android';
        this.textInput = document.createElement('textarea');
        this.textInput.className = 'mobile-floating-tools__textarea';
        this.textInput.rows = 3;
        this.textInput.placeholder = 'Type text';
        this.textInput.setAttribute('autocomplete', 'off');
        const sendTextButton = this.createTextButton('Send text');
        sendTextButton.addEventListener('click', this.sendText);
        textSection.appendChild(textLabel);
        textSection.appendChild(this.textInput);
        textSection.appendChild(sendTextButton);
        this.panel.appendChild(textSection);

        const clipboardSection = document.createElement('div');
        clipboardSection.className = 'mobile-floating-tools__section';
        const clipboardLabel = document.createElement('label');
        clipboardLabel.innerText = 'Remote clipboard';
        this.clipboardInput = document.createElement('textarea');
        this.clipboardInput.className = 'mobile-floating-tools__textarea';
        this.clipboardInput.rows = 3;
        this.clipboardInput.placeholder = 'Clipboard contents';
        const clipboardButtons = document.createElement('div');
        clipboardButtons.className = 'mobile-floating-tools__button-row';
        const readClipboardButton = this.createTextButton('Read');
        readClipboardButton.addEventListener('click', this.readClipboard);
        const writeClipboardButton = this.createTextButton('Write');
        writeClipboardButton.addEventListener('click', this.writeClipboard);
        const copyClipboardButton = this.createTextButton('Copy here');
        copyClipboardButton.addEventListener('click', this.copyClipboardHere);
        clipboardButtons.appendChild(readClipboardButton);
        clipboardButtons.appendChild(writeClipboardButton);
        clipboardButtons.appendChild(copyClipboardButton);
        clipboardSection.appendChild(clipboardLabel);
        clipboardSection.appendChild(this.clipboardInput);
        clipboardSection.appendChild(clipboardButtons);
        this.panel.appendChild(clipboardSection);

        const keys = document.createElement('div');
        keys.className = 'mobile-floating-tools__key-grid';
        keys.appendChild(this.createKeyButton('Back', Icon.BACK, KeyEvent.KEYCODE_BACK));
        keys.appendChild(this.createKeyButton('Home', Icon.HOME, KeyEvent.KEYCODE_HOME));
        keys.appendChild(this.createKeyButton('Recent', Icon.OVERVIEW, KeyEvent.KEYCODE_APP_SWITCH));
        keys.appendChild(this.createKeyButton('Vol -', Icon.VOLUME_DOWN, KeyEvent.KEYCODE_VOLUME_DOWN));
        keys.appendChild(this.createKeyButton('Vol +', Icon.VOLUME_UP, KeyEvent.KEYCODE_VOLUME_UP));
        keys.appendChild(this.createKeyButton('Power', Icon.POWER, KeyEvent.KEYCODE_POWER));
        this.panel.appendChild(keys);

        const actions = document.createElement('div');
        actions.className = 'mobile-floating-tools__button-row';
        this.fullscreenButton = this.createTextButton('Fullscreen');
        this.fullscreenButton.addEventListener('click', this.toggleFullscreen);
        const disconnectButton = this.createTextButton('Disconnect');
        disconnectButton.addEventListener('click', this.listener.disconnect);
        actions.appendChild(this.fullscreenButton);
        actions.appendChild(disconnectButton);
        this.panel.appendChild(actions);

        this.status = document.createElement('div');
        this.status.className = 'mobile-floating-tools__status';
        this.panel.appendChild(this.status);

        this.toggleButton = this.createIconButton('Open tools', Icon.MORE);
        this.toggleButton.classList.add('mobile-floating-tools__toggle');
        this.toggleButton.setAttribute('aria-expanded', 'false');
        this.toggleButton.addEventListener('pointerdown', this.onPointerDown);
        this.toggleButton.addEventListener('pointermove', this.onPointerMove);
        this.toggleButton.addEventListener('pointerup', this.onPointerUp);
        this.toggleButton.addEventListener('pointercancel', this.onPointerCancel);
        this.toggleButton.addEventListener('keydown', this.onToggleKeyDown);

        this.backButton = this.createIconButton('Back', Icon.BACK);
        this.backButton.classList.add('mobile-floating-tools__back');
        this.backButton.addEventListener('click', this.sendBack);

        this.root.appendChild(this.backdrop);
        this.root.appendChild(this.panel);
        this.root.appendChild(this.backButton);
        this.root.appendChild(this.toggleButton);
        container.appendChild(this.root);
        document.addEventListener('fullscreenchange', this.updateFullscreenButton);
        this.restorePosition();
    }

    private createIconButton(label: string, icon: Icon): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mobile-floating-tools__icon-button';
        button.title = label;
        button.setAttribute('aria-label', label);
        button.appendChild(SvgImage.create(icon));
        return button;
    }

    private createTextButton(label: string): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mobile-floating-tools__button';
        button.innerText = label;
        return button;
    }

    private createKeyButton(label: string, icon: Icon, code: number): HTMLButtonElement {
        const button = this.createTextButton(label);
        button.classList.add('mobile-floating-tools__key-button');
        button.insertBefore(SvgImage.create(icon), button.firstChild);
        button.addEventListener('click', () => {
            this.listener.sendMessage(new KeyCodeControlMessage(KeyEvent.ACTION_DOWN, code, 0, 0));
            this.listener.sendMessage(new KeyCodeControlMessage(KeyEvent.ACTION_UP, code, 0, 0));
        });
        return button;
    }

    private sendBack = (): void => {
        this.listener.sendMessage(new KeyCodeControlMessage(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BACK, 0, 0));
        this.listener.sendMessage(new KeyCodeControlMessage(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_BACK, 0, 0));
    };

    private sendText = (): void => {
        if (!this.textInput.value) {
            return;
        }
        this.listener.sendMessage(new TextControlMessage(this.textInput.value));
        this.setStatus('Text sent');
    };

    private readClipboard = (): void => {
        this.listener.sendMessage(new CommandControlMessage(ControlMessage.TYPE_GET_CLIPBOARD));
        this.setStatus('Reading remote clipboard...');
    };

    private writeClipboard = (): void => {
        this.listener.sendMessage(CommandControlMessage.createSetClipboardCommand(this.clipboardInput.value));
        this.setStatus('Remote clipboard updated');
    };

    private copyClipboardHere = async (): Promise<void> => {
        try {
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(this.clipboardInput.value);
            } else {
                this.clipboardInput.select();
                document.execCommand('copy');
            }
            this.setStatus('Copied to this device');
        } catch (error) {
            this.setStatus('Copy permission was denied');
        }
    };

    public onDeviceMessage(message: DeviceMessage): void {
        if (message.type !== DeviceMessage.TYPE_CLIPBOARD) {
            return;
        }
        this.clipboardInput.value = message.getText();
        this.setStatus('Remote clipboard loaded');
    }

    private setStatus(text: string): void {
        this.status.innerText = text;
    }

    private closePanel = (): void => {
        this.root.classList.remove('is-open');
        this.toggleButton.setAttribute('aria-expanded', 'false');
    };

    private togglePanel = (): void => {
        const open = !this.root.classList.contains('is-open');
        this.root.classList.toggle('is-open', open);
        this.toggleButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    private onToggleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.togglePanel();
        }
    };

    private onPointerDown = (event: PointerEvent): void => {
        this.pointerId = event.pointerId;
        this.pointerStart = { x: event.clientX, y: event.clientY };
        const rect = this.toggleButton.getBoundingClientRect();
        this.buttonStart = { left: rect.left, top: rect.top };
        this.moved = false;
        this.toggleButton.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
    };

    private onPointerMove = (event: PointerEvent): void => {
        if (this.pointerId !== event.pointerId || !this.pointerStart || !this.buttonStart) {
            return;
        }
        const deltaX = event.clientX - this.pointerStart.x;
        const deltaY = event.clientY - this.pointerStart.y;
        if (!this.moved && Math.hypot(deltaX, deltaY) < 6) {
            return;
        }
        this.moved = true;
        this.setPosition(this.buttonStart.left + deltaX, this.buttonStart.top + deltaY);
        event.preventDefault();
        event.stopPropagation();
    };

    private onPointerUp = (event: PointerEvent): void => {
        if (this.pointerId !== event.pointerId) {
            return;
        }
        if (this.toggleButton.hasPointerCapture(event.pointerId)) {
            this.toggleButton.releasePointerCapture(event.pointerId);
        }
        if (!this.moved) {
            this.togglePanel();
        } else {
            this.savePosition();
        }
        this.pointerId = undefined;
        this.pointerStart = undefined;
        this.buttonStart = undefined;
        event.preventDefault();
        event.stopPropagation();
    };

    private onPointerCancel = (event: PointerEvent): void => {
        if (this.pointerId === event.pointerId) {
            this.pointerId = undefined;
            this.pointerStart = undefined;
            this.buttonStart = undefined;
        }
    };

    private setPosition(left: number, top: number): void {
        const margin = 8;
        const rect = this.toggleButton.getBoundingClientRect();
        const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
        const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
        const nextLeft = Math.min(Math.max(margin, left), maxLeft);
        const nextTop = Math.min(Math.max(margin, top), maxTop);
        this.toggleButton.style.left = `${nextLeft}px`;
        this.toggleButton.style.top = `${nextTop}px`;
        this.toggleButton.style.right = 'auto';
        this.toggleButton.style.bottom = 'auto';
        const backRect = this.backButton.getBoundingClientRect();
        const backLeft = Math.max(margin, nextLeft - backRect.width - 8);
        const backTop = nextTop + (rect.height - backRect.height) / 2;
        this.backButton.style.left = `${backLeft}px`;
        this.backButton.style.top = `${backTop}px`;
        this.backButton.style.right = 'auto';
        this.backButton.style.bottom = 'auto';
    }

    private savePosition(): void {
        try {
            const rect = this.toggleButton.getBoundingClientRect();
            window.localStorage.setItem(
                MobileFloatingTools.positionStorageKey,
                JSON.stringify({ left: rect.left, top: rect.top } as StoredPosition),
            );
        } catch (error) {}
    }

    private restorePosition(): void {
        try {
            const value = window.localStorage.getItem(MobileFloatingTools.positionStorageKey);
            if (!value) {
                return;
            }
            const position = JSON.parse(value) as StoredPosition;
            if (typeof position.left === 'number' && typeof position.top === 'number') {
                this.setPosition(position.left, position.top);
            }
        } catch (error) {}
    }

    private toggleFullscreen = async (): Promise<void> => {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else if (this.container.requestFullscreen) {
                await this.container.requestFullscreen();
            } else {
                this.setStatus('Fullscreen is not supported');
            }
        } catch (error) {
            this.setStatus('Fullscreen permission was denied');
        }
        this.updateFullscreenButton();
    };

    private updateFullscreenButton = (): void => {
        this.fullscreenButton.innerText = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
    };

    public release(): void {
        document.removeEventListener('fullscreenchange', this.updateFullscreenButton);
        this.root.remove();
    }
}
