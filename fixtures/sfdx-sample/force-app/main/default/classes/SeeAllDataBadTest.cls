@isTest(SeeAllData=true)
private class SeeAllDataBadTest {
    @IsTest(seeAllData = true)
    static void readsOrgData() {
        Integer count = [SELECT COUNT() FROM Account];
        System.assert(count > 0, 'Expects existing org data');
    }
}
