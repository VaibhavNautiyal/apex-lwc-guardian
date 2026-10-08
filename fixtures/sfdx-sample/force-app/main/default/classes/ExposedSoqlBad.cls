public with sharing class ExposedSoqlBad {
    @AuraEnabled(cacheable=true)
    public static List<Account> getAccounts() {
        return [SELECT Id, Name, AnnualRevenue FROM Account LIMIT 50];
    }

    @AuraEnabled
    public static List<SObject> search(String term) {
        String pattern = '%' + term + '%';
        return Database.query('SELECT Id, Name FROM Contact WHERE Name LIKE :pattern');
    }
}
