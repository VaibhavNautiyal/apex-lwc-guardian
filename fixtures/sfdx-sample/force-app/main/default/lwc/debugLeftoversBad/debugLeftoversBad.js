import { LightningElement, api } from 'lwc';

export default class DebugLeftoversBad extends LightningElement {
    @api recordId;

    connectedCallback() {
        console.log('recordId', this.recordId);
        debugger;
    }

    handleClick(event) {
        console.debug(event.detail);
    }
}
