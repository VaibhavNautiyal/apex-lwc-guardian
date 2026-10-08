public with sharing class DmlInLoopBad {
    public static void insertPerRecord(List<String> names) {
        for (String name : names) {
            Account acc = new Account(Name = name);
            insert acc;
        }
    }

    public static void singleStatementWhile(List<Contact> contacts) {
        Integer i = 0;
        while (i < contacts.size())
            update contacts[i++];
    }

    public static void nested(List<Account> accounts) {
        for (Account acc : accounts) {
            for (Integer attempt = 0; attempt < 2; attempt++) {
                Database.insert(new Contact(LastName = 'Retry', AccountId = acc.Id), false);
            }
        }
    }

    public static void ifInsideLoop(List<Case> cases) {
        for (Case c : cases) {
            if (c.Status == 'Closed') delete c;
            else upsert c;
        }
    }
}
