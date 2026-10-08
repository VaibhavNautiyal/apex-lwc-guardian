public with sharing class AccountHealthService {
    @AuraEnabled(cacheable=true)
    public static List<AccountHealth> getHealth(List<Id> accountIds) {
        Map<Id, Integer> openCases = new Map<Id, Integer>();
        for (AggregateResult row : [
            SELECT AccountId, COUNT(Id) total
            FROM Case
            WHERE AccountId IN :accountIds AND IsClosed = false
            WITH USER_MODE
            GROUP BY AccountId
        ]) {
            openCases.put((Id) row.get('AccountId'), (Integer) row.get('total'));
        }

        List<AccountHealth> results = new List<AccountHealth>();
        for (Id accountId : accountIds) {
            Integer count = openCases.get(accountId);
            results.add(new AccountHealth(accountId, count == null ? 0 : count));
        }
        return results;
    }

    public static void escalate(List<Case> cases) {
        Id priorityQueueId = [
            SELECT Id FROM Group WHERE Type = 'Queue' AND DeveloperName = 'Priority_Support' WITH USER_MODE LIMIT 1
        ].Id;
        for (Case c : cases) {
            c.OwnerId = priorityQueueId;
        }
        update cases;
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
