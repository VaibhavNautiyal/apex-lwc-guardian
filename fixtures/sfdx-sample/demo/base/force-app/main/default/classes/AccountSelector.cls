public with sharing class AccountSelector {
    public static List<Account> byIds(Set<Id> accountIds) {
        return [SELECT Id, Name, OwnerId FROM Account WHERE Id IN :accountIds WITH USER_MODE];
    }
}
