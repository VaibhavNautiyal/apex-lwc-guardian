public with sharing class CalloutInLoopGood {
    public static void syncAll(List<Account> accounts) {
        List<Map<String, Object>> payload = new List<Map<String, Object>>();
        for (Account acc : accounts) {
            payload.add(new Map<String, Object>{ 'id' => acc.Id, 'name' => acc.Name });
        }
        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:Erp/accounts/bulk');
        req.setMethod('POST');
        req.setBody(JSON.serialize(payload));
        HttpResponse res = new Http().send(req);
        System.debug(res.getStatusCode());
    }

    public static void notifyEach(List<Messaging.SingleEmailMessage> emails, EventSender sender) {
        for (Messaging.SingleEmailMessage email : emails) {
            sender.send(email);
        }
    }

    public interface EventSender {
        void send(Messaging.SingleEmailMessage email);
    }
}
