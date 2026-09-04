import { ParamsStreamScrcpy } from '../../../types/ParamsStreamScrcpy';
import Rect from '../../Rect';
import Size from '../../Size';
import VideoSettings from '../../VideoSettings';

const STORAGE_KEY = 'ws-scrcpy.last-stream-configuration';

export class LastStreamConfiguration {
    public static save(params: ParamsStreamScrcpy, videoSettings: VideoSettings): void {
        if (!window.localStorage) {
            return;
        }
        try {
            const streamParams = { ...params };
            delete streamParams.videoSettings;
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                    params: streamParams,
                    videoSettings,
                }),
            );
        } catch (error) {
            console.error('[LastStreamConfiguration]', 'Failed to save configuration', error);
        }
    }

    public static load(): ParamsStreamScrcpy | undefined {
        if (!window.localStorage) {
            return;
        }
        try {
            const value = window.localStorage.getItem(STORAGE_KEY);
            if (!value) {
                return;
            }
            const parsed = JSON.parse(value);
            if (!parsed || typeof parsed.params !== 'object' || typeof parsed.videoSettings !== 'object') {
                return;
            }
            const { bounds, crop } = parsed.videoSettings;
            const videoSettings = new VideoSettings({
                ...parsed.videoSettings,
                bounds: bounds ? new Size(bounds.width, bounds.height) : bounds,
                crop: crop ? new Rect(crop.left, crop.top, crop.right, crop.bottom) : crop,
            });
            return {
                ...parsed.params,
                videoSettings,
            } as ParamsStreamScrcpy;
        } catch (error) {
            console.error('[LastStreamConfiguration]', 'Failed to load configuration', error);
            return;
        }
    }
}
