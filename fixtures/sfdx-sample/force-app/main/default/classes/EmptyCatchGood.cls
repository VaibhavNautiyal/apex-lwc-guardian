public with sharing class EmptyCatchGood {
    public static void save(List<Account> accounts) {
        try {
            update accounts;
        } catch (DmlException e) {
            System.debug(LoggingLevel.ERROR, e.getMessage());
            throw e;
        }
    }

    public static Integer parse(String value) {
        try {
            return Integer.valueOf(value);
        } catch (TypeException e) {
            // Not a number: callers treat null as "no value".
        }
        return null;
    }
}
