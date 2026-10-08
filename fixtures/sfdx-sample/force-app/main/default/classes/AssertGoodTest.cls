@IsTest
private class AssertGoodTest {
    @TestSetup
    static void setup() {
        insert new Account(Name = 'Acme');
    }

    @IsTest
    static void classicAssert() {
        Account acc = [SELECT Id, Name FROM Account LIMIT 1];
        System.assertEquals('Acme', acc.Name, 'Name should be unchanged');
    }

    @IsTest
    static void assertClass() {
        Assert.areEqual(1, [SELECT COUNT() FROM Account]);
    }

    @IsTest
    static void usesHelper() {
        Account acc = [SELECT Id, Name FROM Account LIMIT 1];
        verifyName(acc, 'Acme');
    }

    static testMethod void legacyStyleWithAssert() {
        System.assert([SELECT COUNT() FROM Account] > 0);
    }

    private static void verifyName(Account acc, String expected) {
        System.assertEquals(expected, acc.Name);
    }
}
