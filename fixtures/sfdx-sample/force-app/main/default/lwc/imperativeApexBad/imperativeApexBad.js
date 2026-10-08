import { LightningElement } from 'lwc';
import getAccounts from '@salesforce/apex/AccountController.getAccounts';
import saveAccount from '@salesforce/apex/AccountController.saveAccount';

export default class ImperativeApexBad extends LightningElement {
    accounts = [];
    loading = false;

    async connectedCallback() {
        this.accounts = await getAccounts();
    }

    handleSave(event) {
        saveAccount({ account: event.detail }).then(() => {
            this.dispatchEvent(new CustomEvent('saved'));
        });
    }

    handleQuickSave(event) {
        saveAccount({ account: event.detail });
    }

    async handleRetry() {
        this.loading = true;
        try {
            this.accounts = await getAccounts();
        } finally {
            this.loading = false;
        }
    }
}
