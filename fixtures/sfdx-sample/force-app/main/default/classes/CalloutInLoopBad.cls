public with sharing class CalloutInLoopBad {
    public static void syncEach(List<Account> accounts) {
        Http http = new Http();
        for (Account acc : accounts) {
            HttpRequest req = new HttpRequest();
            req.setEndpoint('callout:Erp/accounts');
            req.setMethod('POST');
            req.setBody(JSON.serialize(acc));
            HttpResponse res = http.send(req);
            System.debug(res.getStatusCode());
        }
    }

    public static void pollUntilDone(HttpRequest req) {
        Integer tries = 0;
        while (tries < 5) {
            HttpResponse res = new Http().send(req);
            if (res.getStatusCode() == 200) {
                break;
            }
            tries++;
        }
    }
}
