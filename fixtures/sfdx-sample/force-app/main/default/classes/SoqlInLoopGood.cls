public with sharing class SoqlInLoopGood {
    public static void queryBeforeLoop(List<Account> accounts) {
        Set<Id> accountIds = new Map<Id, Account>(accounts).keySet();
        Map<Id, Contact> contacts = new Map<Id, Contact>([SELECT Id, AccountId FROM Contact WHERE AccountId IN :accountIds]);
        for (Account acc : accounts) {
            // [SELECT Id FROM Contact WHERE AccountId = :acc.Id] would be wrong here
            /* Database.query('SELECT Id FROM Contact'); */
            String note = '[SELECT Id FROM Contact]';
            System.debug(note + contacts.size());
        }
    }

    public static void soqlForLoop() {
        for (Account acc : [SELECT Id, Name FROM Account WHERE Name != null]) {
            System.debug(acc.Name);
        }
    }

    public static void loopInOtherMethod(List<Account> accounts) {
        logAll(accounts);
        List<Account> locked = [SELECT Id FROM Account WHERE Id IN :accounts FOR UPDATE];
        System.debug(locked);
    }

    private static void logAll(List<Account> accounts) {
        for (Account acc : accounts)
            System.debug(acc);
    }

    public static Integer queryAfterDoWhile(Integer n) {
        Integer i = 0;
        do {
            i++;
        } while (i < n);
        return [SELECT COUNT() FROM Account];
    }
}
