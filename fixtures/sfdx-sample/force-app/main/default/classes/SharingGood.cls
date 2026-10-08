/**
 * public class InComment {} must not count as a class.
 */
public inherited sharing class SharingGood {
    public class Wrapper {
        public String label;
    }

    public class SharingGoodException extends Exception {}

    public static List<Account> recentAccounts() {
        return [SELECT Id, Name FROM Account ORDER BY CreatedDate DESC LIMIT 10];
    }
}
