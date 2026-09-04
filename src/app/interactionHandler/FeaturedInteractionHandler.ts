import { InteractionEvents, KeyEventNames, InteractionHandler } from './InteractionHandler';
import { BasePlayer } from '../player/BasePlayer';
import { ControlMessage } from '../controlMessage/ControlMessage';
import { TouchControlMessage } from '../controlMessage/TouchControlMessage';
import MotionEvent from '../MotionEvent';
import ScreenInfo from '../ScreenInfo';
import { ScrollControlMessage } from '../controlMessage/ScrollControlMessage';
import type { ControlMessageSendResult } from '../client/StreamReceiver';

const TAG = '[FeaturedTouchHandler]';

export interface InteractionHandlerListener {
    sendMessage: (message: ControlMessage) => ControlMessageSendResult;
    isStreamConnected?: () => boolean;
}

export class FeaturedInteractionHandler extends InteractionHandler {
    private static readonly touchEventsNames: InteractionEvents[] = [
        'touchstart',
        'touchend',
        'touchmove',
        'touchcancel',
        'mousedown',
        'mouseup',
        'mousemove',
        'wheel',
    ];
    private static readonly keyEventsNames: KeyEventNames[] = ['keydown', 'keyup'];
    public static SCROLL_EVENT_THROTTLING_TIME = 30; // one event per 50ms
    private readonly storedFromMouseEvent = new Map<number, TouchControlMessage>();
    private readonly storedFromTouchEvent = new Map<number, TouchControlMessage>();
    private readonly debug: boolean;
    private debugMoveReported = false;
    private debugEvents: string[] = [];
    private lastScrollEvent?: { time: number; hScroll: number; vScroll: number };

    constructor(player: BasePlayer, public readonly listener: InteractionHandlerListener, debug = false) {
        super(player, FeaturedInteractionHandler.touchEventsNames, FeaturedInteractionHandler.keyEventsNames);
        this.debug = debug;
        this.tag.addEventListener('mouseleave', this.onMouseLeave);
        this.tag.addEventListener('mouseenter', this.onMouseEnter);
    }

    public buildScrollEvent(event: WheelEvent, screenInfo: ScreenInfo): ScrollControlMessage[] {
        const messages: ScrollControlMessage[] = [];
        const touchOnClient = InteractionHandler.buildTouchOnClient(event, screenInfo);
        if (touchOnClient) {
            const hScroll = event.deltaX > 0 ? -1 : event.deltaX < -0 ? 1 : 0;
            const vScroll = event.deltaY > 0 ? -1 : event.deltaY < -0 ? 1 : 0;
            const time = Date.now();
            if (
                !this.lastScrollEvent ||
                time - this.lastScrollEvent.time > FeaturedInteractionHandler.SCROLL_EVENT_THROTTLING_TIME ||
                this.lastScrollEvent.vScroll !== vScroll ||
                this.lastScrollEvent.hScroll !== hScroll
            ) {
                this.lastScrollEvent = { time, hScroll, vScroll };
                messages.push(new ScrollControlMessage(touchOnClient.touch.position, hScroll, vScroll));
            }
        }
        return messages;
    }

    protected onInteraction(event: MouseEvent | TouchEvent): void {
        const isTouchEvent = event.type.startsWith('touch');
        const screenInfo = this.player.getScreenInfo();
        if (!screenInfo) {
            this.showTouchDebug(event, false, 0, 'no-screen-info');
            return;
        }
        let messages: ControlMessage[];
        let storage: Map<number, TouchControlMessage>;
        if (isTouchEvent) {
            const touchEvent = event as TouchEvent;
            const touchTargetAccepted =
                this.isTouchTarget(event.target) ||
                Array.from(touchEvent.changedTouches || []).some((touch) => this.isTouchTarget(touch.target));
            if (!touchTargetAccepted) {
                this.showTouchDebug(event, false, 0, 'target-outside-video');
                return;
            }
            storage = this.storedFromTouchEvent;
            messages = this.formatTouchEvent(touchEvent, screenInfo, storage);
        } else if (event instanceof MouseEvent) {
            if (!this.isTouchTarget(event.target)) {
                return;
            }
            if (window['WheelEvent'] && event instanceof WheelEvent) {
                messages = this.buildScrollEvent(event, screenInfo);
            } else {
                storage = this.storedFromMouseEvent;
                messages = this.buildTouchEvent(event, screenInfo, storage);
            }
            if (this.over) {
                this.lastPosition = event;
            }
        } else {
            console.error(TAG, 'Unsupported event', event);
            return;
        }
        if (event.cancelable) {
            event.preventDefault();
        }
        event.stopPropagation();
        const sendStatuses = messages.map((message) => this.listener.sendMessage(message));
        this.showTouchDebug(event, true, messages.length, '', messages, sendStatuses);
    }

    private showTouchDebug(
        event: MouseEvent | TouchEvent,
        accepted: boolean,
        messageCount: number,
        reason = '',
        messages: ControlMessage[] = [],
        sendStatuses: ControlMessageSendResult[] = [],
    ): void {
        if (!this.debug || !event.type.startsWith('touch')) {
            return;
        }
        if (event.type === 'touchstart') {
            this.debugMoveReported = false;
        } else if (event.type === 'touchmove') {
            if (this.debugMoveReported) {
                return;
            }
            this.debugMoveReported = true;
        }
        const touchEvent = event as TouchEvent;
        const changed = Array.from(touchEvent.changedTouches || [])
            .map((touch) => (this.isTouchTarget(touch.target) ? 'canvas' : this.describeTarget(touch.target)))
            .join(',');
        const target = this.describeTarget(event.target);
        const connected = this.listener.isStreamConnected ? this.listener.isStreamConnected() : 'unknown';
        const firstTouch = touchEvent.changedTouches && touchEvent.changedTouches[0];
        const rect = this.tag.getBoundingClientRect();
        const coordinates = firstTouch
            ? ` client=${Math.round(firstTouch.clientX)},${Math.round(firstTouch.clientY)} ` +
              `local=${Math.round(firstTouch.clientX - rect.left)},${Math.round(firstTouch.clientY - rect.top)}`
            : '';
        const mapped = messages
            .filter((message): message is TouchControlMessage => message instanceof TouchControlMessage)
            .map(
                (message) =>
                    `${message.action}:${message.position.point.x},${message.position.point.y}/` +
                    `${message.position.screenSize.width}x${message.position.screenSize.height}`,
            )
            .join('|');
        const sent = messages
            .map((message, index) => {
                if (message instanceof TouchControlMessage) {
                    return (
                        `${message.action}:${message.position.point.x},${message.position.point.y}/` +
                        `${message.position.screenSize.width}x${message.position.screenSize.height}:` +
                        `p=${message.pressure}:${this.formatSendResult(sendStatuses[index])}`
                    );
                }
                return `${message.type}:${this.formatSendResult(sendStatuses[index])}`;
            })
            .join('|');
        this.debugEvents.push(
            `${event.type} eventTarget=${target} touchTarget=${changed || 'none'} ` +
                `accepted=${accepted} messages=${messageCount} activePointers=${this.storedFromTouchEvent.size} ` +
                `canvas=${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)}x${Math.round(
                    rect.height,
                )} ` +
                `${coordinates} mapped=${mapped || 'none'} sent=${sent || 'none'} ` +
                `connected=${connected}${reason ? ` reason=${reason}` : ''}`,
        );
        if (event.type === 'touchend' || event.type === 'touchcancel') {
            const details = this.debugEvents.join('\n');
            this.debugEvents = [];
            window.setTimeout(() => {
                window.alert(`[touch-debug]\n${details}`);
            }, 0);
        }
    }

    private formatSendResult(result?: ControlMessageSendResult): string {
        if (!result) {
            return 'unknown';
        }
        return result.error ? `${result.status}(${result.error})` : result.status;
    }

    private describeTarget(target: EventTarget | null): string {
        if (target instanceof HTMLElement) {
            return target.tagName.toLowerCase() + (target.className ? `.${target.className}` : '');
        }
        return target ? target.constructor.name : 'none';
    }

    protected onKey(event: KeyboardEvent): void {
        if (!this.lastPosition) {
            return;
        }
        const screenInfo = this.player.getScreenInfo();
        if (!screenInfo) {
            return;
        }
        const { ctrlKey, shiftKey } = event;
        const { target, button, buttons, clientY, clientX } = this.lastPosition;
        const type = InteractionHandler.SIMULATE_MULTI_TOUCH;
        const props = { ctrlKey, shiftKey, type, target, button, buttons, clientX, clientY };
        this.buildTouchEvent(props, screenInfo, new Map());
    }

    private onMouseEnter = (): void => {
        this.over = true;
    };
    private onMouseLeave = (): void => {
        this.lastPosition = undefined;
        this.over = false;
        this.storedFromMouseEvent.forEach((message) => {
            this.listener.sendMessage(InteractionHandler.createEmulatedMessage(MotionEvent.ACTION_UP, message));
        });
        this.storedFromMouseEvent.clear();
        this.clearCanvas();
    };

    public release(): void {
        super.release();
        this.tag.removeEventListener('mouseleave', this.onMouseLeave);
        this.tag.removeEventListener('mouseenter', this.onMouseEnter);
        this.storedFromMouseEvent.clear();
    }
}
