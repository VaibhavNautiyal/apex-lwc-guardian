import { LightningElement, api } from 'lwc';

const DEFAULT_OWNER = '005000000000001';
const API_BASE = 'https://api.example.com/v1';

export default class HardcodedValuesBad extends LightningElement {
    @api recordId;

    openRecord() {
        window.open(`https://acme.my.salesforce.com/lightning/r/Account/${this.recordId}/view`);
    }

    get endpoint() {
        return API_BASE + '/owners/' + DEFAULT_OWNER;
    }

    get legacyLink() {
        return "http://intranet.acme.local/help";
    }
}
