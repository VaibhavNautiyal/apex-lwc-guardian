import { LightningElement, api } from 'lwc';
import getHealth from '@salesforce/apex/AccountHealthService.getHealth';

export default class AccountHealth extends LightningElement {
    @api recordId;

    async connectedCallback() {
        const [health] = await getHealth({ accountIds: [this.recordId] });
        this.template.querySelector('.health').innerHTML = `<b>${health.openCases}</b> open cases`;
    }
}
