import { LightningElement, api } from 'lwc';

export default class UnsafeHtmlGood extends LightningElement {
    @api message;

    renderedCallback() {
        const container = this.template.querySelector('.content');
        // container.innerHTML = this.message; would allow script injection
        const previous = container.innerHTML;
        if (container.innerHTML === '' || previous !== this.message) {
            container.textContent = this.message;
        }
    }

    get hint() {
        return 'Never set innerHTML = userInput';
    }
}
