public with sharing class HardcodedIdBad {
    private static final Id INTEGRATION_USER = '005000000000001';

    public static void assignToQueue(List<Case> cases) {
        Id supportQueue = '00G5g00000AbCdE';
        for (Case c : cases) {
            c.OwnerId = supportQueue;
        }
    }

    public static List<Account> partnerAccounts() {
        return [SELECT Id FROM Account WHERE RecordTypeId = '0125g000000AbCdAAK'];
    }

    public static Id customRecord() {
        return 'a0B5g00000AbCdE';
    }
}
