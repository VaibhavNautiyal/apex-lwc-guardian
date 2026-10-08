@IsTest
private class AccountHealthServiceTest {
    @IsTest
    static void returnsHealthForEachAccount() {
        Account acc = new Account(Name = 'Acme');
        insert acc;
        insert new Case(AccountId = acc.Id, Subject = 'Broken');

        Test.startTest();
        List<AccountHealthService.AccountHealth> health = AccountHealthService.getHealth(new List<Id>{ acc.Id });
        Test.stopTest();
    }
}
