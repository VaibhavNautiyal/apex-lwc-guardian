import { LightningElement, wire } from 'lwc';
import getAccounts from '@salesforce/apex/AccountController.getAccounts';
import saveAccount from '@salesforce/apex/AccountController.saveAccount';
import { reduceErrors } from 'c/ldsUtils';

export default class ImperativeApexGood extends LightningElement {
    error;
    extra = [];

    @wire(getAccounts) accounts;

    async connectedCallback() {
        try {
            this.extra = await getAccounts();
        } catch (e) {
            this.error = reduceErrors(e);
        }
    }

    handleSave(event) {
        saveAccount({ account: event.detail })
            .then(() => this.dispatchEvent(new CustomEvent('saved')))
            .catch((e) => {
                this.error = reduceErrors(e);
            });
    }

    handleTwoArgumentThen(event) {
        saveAccount({ account: event.detail }).then(
            () => this.dispatchEvent(new CustomEvent('saved')),
            (e) => {
                this.error = reduceErrors(e);
            }
        );
    }

    loadAccounts() {
        // getAccounts() here would need a catch
        return getAccounts();
    }

    async loadWithFallback() {
        this.extra = await getAccounts().catch(() => []);
    }
}
