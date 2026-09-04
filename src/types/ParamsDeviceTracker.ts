import { ParamsBase } from './ParamsBase';

export interface ParamsDeviceTracker extends ParamsBase {
    type: 'android' | 'ios';
    mobile?: boolean;
    debug?: boolean;
}
