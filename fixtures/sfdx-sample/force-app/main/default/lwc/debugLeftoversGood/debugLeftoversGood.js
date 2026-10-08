import { LightningElement, api } from 'lwc';

export default class DebugLeftoversGood extends LightningElement {
    @api recordId;
    logger = { log: () => {} };

    connectedCallback() {
        // console.log('recordId', this.recordId);
        this.logger.log('connected');
    }

    handleError(error) {
        console.error('Load failed', error);
    }

    get tip() {
        return 'Remove console.log and debugger before release';
    }
}
