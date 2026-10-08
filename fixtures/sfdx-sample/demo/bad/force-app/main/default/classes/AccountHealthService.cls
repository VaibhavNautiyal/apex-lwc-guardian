public class AccountHealthService {
    private static final Id PRIORITY_QUEUE_ID = '00G5g00000AbCdE';

    @AuraEnabled(cacheable=true)
    public static List<AccountHealth> getHealth(List<Id> accountIds) {
        List<AccountHealth> results = new List<AccountHealth>();
        for (Id accountId : accountIds) {
            Integer openCases = [SELECT COUNT() FROM Case WHERE AccountId = :accountId AND IsClosed = false];
            results.add(new AccountHealth(accountId, openCases));
        }
        return results;
    }

    public static void escalate(List<Case> cases) {
        for (Case c : cases) {
            c.OwnerId = PRIORITY_QUEUE_ID;
            update c;
        }
    }

    public class AccountHealth {
        @AuraEnabled public Id accountId;
        @AuraEnabled public Integer openCases;

        public AccountHealth(Id accountId, Integer openCases) {
            this.accountId = accountId;
            this.openCases = openCases;
        }
    }
}
