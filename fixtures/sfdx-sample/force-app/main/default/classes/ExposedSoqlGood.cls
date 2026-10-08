public with sharing class ExposedSoqlGood {
    @AuraEnabled(cacheable=true)
    public static List<Account> getAccounts() {
        return [SELECT Id, Name, AnnualRevenue FROM Account WITH USER_MODE LIMIT 50];
    }

    @AuraEnabled(cacheable=true)
    public static List<Contact> getContacts() {
        return [SELECT Id, Name FROM Contact WITH SECURITY_ENFORCED LIMIT 50];
    }

    @AuraEnabled
    public static List<SObject> search(String term) {
        String pattern = '%' + term + '%';
        return Database.query('SELECT Id, Name FROM Contact WHERE Name LIKE :pattern', AccessLevel.USER_MODE);
    }
}
