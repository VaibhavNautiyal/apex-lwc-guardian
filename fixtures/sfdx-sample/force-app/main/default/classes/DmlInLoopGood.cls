public with sharing class DmlInLoopGood {
    public static void insertAfterLoop(List<String> names) {
        List<Account> toInsert = new List<Account>();
        Boolean updated = false;
        for (String name : names) {
            // insert acc; would be wrong here
            String label = 'update later';
            toInsert.add(new Account(Name = name + label));
            updated = Schema.SObjectType.Account.isUpdateable();
        }
        insert toInsert;
        System.debug(updated);
    }

    public static void databaseAfterLoop(List<Contact> contacts) {
        for (Contact c : contacts) {
            c.Description = 'Checked';
        }
        Database.update(contacts, false);
    }
}
