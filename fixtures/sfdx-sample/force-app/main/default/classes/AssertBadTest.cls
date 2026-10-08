@isTest
private class AssertBadTest {
    @TestSetup
    static void setup() {
        insert new Account(Name = 'Acme');
    }

    @isTest
    static void runsWithoutChecking() {
        Account acc = [SELECT Id, Name FROM Account LIMIT 1];
        acc.Name = 'Changed';
        update acc;
        // System.assertEquals('Changed', acc.Name);
    }

    static testMethod void legacyStyleTest() {
        System.debug('coverage only');
    }
}
