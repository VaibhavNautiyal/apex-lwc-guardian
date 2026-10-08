import { LightningElement, api } from 'lwc';
import getHealth from '@salesforce/apex/AccountHealthService.getHealth';

export default class AccountHealth extends LightningElement {
    @api recordId;
    openCases;
    error;

    async connectedCallback() {
        try {
            const [health] = await getHealth({ accountIds: [this.recordId] });
            this.openCases = health.openCases;
        } catch (e) {
            this.error = e.body ? e.body.message : e.message;
        }
    }
}
