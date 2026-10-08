import { LightningElement, api } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';

const SVG_NS = 'http://www.w3.org/2000/svg';

export default class HardcodedValuesGood extends NavigationMixin(LightningElement) {
    @api recordId;
    @api host;

    openRecord() {
        // Old code opened https://acme.my.salesforce.com/lightning/r/Account/005000000000001/view
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: { recordId: this.recordId, actionName: 'view' }
        });
    }

    get relativeLink() {
        return '/lightning/r/Account/' + this.recordId + '/view';
    }

    get dynamicLink() {
        return `https://${this.host}/help`;
    }

    createIcon() {
        return document.createElementNS(SVG_NS, 'svg');
    }
}
