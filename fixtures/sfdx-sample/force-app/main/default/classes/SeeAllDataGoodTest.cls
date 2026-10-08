@isTest(SeeAllData=false)
private class SeeAllDataGoodTest {
    // @isTest(SeeAllData=true) is not needed here.
    @IsTest(isParallel=true)
    static void createsOwnData() {
        insert new Account(Name = 'Acme');
        Assert.areEqual(1, [SELECT COUNT() FROM Account]);
    }
}
