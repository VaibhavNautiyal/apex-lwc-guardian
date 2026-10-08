public with sharing class HardcodedIdGood {
    // Old code used '005000000000001' here.
    private static final String GREETING = 'Hello world';
    private static final String UPPER_WORD = 'ABCDEFGHIJKLMNO';
    private static final String ORDER_REF = 'customer-000123';
    private static final String NOT_AN_ID = '001ABCDEFGHIJKLMNO';
    private static final String NUMBERS = '123456789012345';

    public static Id partnerRecordType() {
        return Schema.SObjectType.Account.getRecordTypeInfosByDeveloperName().get('Partner').getRecordTypeId();
    }

    public static Id supportQueue() {
        return [SELECT Id FROM Group WHERE Type = 'Queue' AND DeveloperName = 'Support' LIMIT 1].Id;
    }
}
