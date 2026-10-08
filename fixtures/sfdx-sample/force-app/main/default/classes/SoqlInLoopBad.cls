public with sharing class SoqlInLoopBad {
    public static void perRecordQuery(List<Account> accounts) {
        for (Account acc : accounts) {
            List<Contact> contacts = [SELECT Id FROM Contact WHERE AccountId = :acc.Id];
            System.debug(contacts.size());
        }
    }

    public static void singleStatementLoop(List<Id> accountIds) {
        for (Id accountId : accountIds)
            System.debug([SELECT COUNT() FROM Contact WHERE AccountId = :accountId]);
    }

    public static void nestedLoops(List<Account> accounts) {
        for (Account acc : accounts) {
            for (Integer i = 0; i < 3; i++) {
                List<SObject> rows = Database.query('SELECT Id FROM Contact LIMIT 1');
                System.debug(rows);
            }
        }
    }

    public static void whileLoop(Integer n) {
        Integer i = 0;
        while (i < n) {
            Account first = [select Id from Account limit 1];
            System.debug(first);
            i++;
        }
    }

    public static void doWhileLoop(Integer n) {
        Integer i = 0;
        do {
            System.debug([SELECT Id FROM Opportunity LIMIT 1]);
            i++;
        } while (i < n);
    }
}
