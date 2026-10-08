public with sharing class EmptyCatchBad {
    public static void save(List<Account> accounts) {
        try {
            update accounts;
        } catch (DmlException e) {
        }
    }

    public static Integer parse(String value) {
        try {
            return Integer.valueOf(value);
        } catch (Exception e) {}
        return null;
    }
}
