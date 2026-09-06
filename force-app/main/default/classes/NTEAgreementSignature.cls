/** Validates the bounded vector schema and PNG transport from the public form. */
public inherited sharing class NTEAgreementSignature {
    public class SignatureException extends Exception {}
    public class Vector {
        public Integer version;
        public Integer width;
        public Integer height;
        public List<String> paths;
    }

    /** Returns the validated contour master; never accepts executable SVG markup. */
    public static Vector validateVector(String value) {
        if (String.isBlank(value) || value.length() > 28000) {
            throw new SignatureException('Signature vector is missing or exceeds the size limit.');
        }
        Vector vector;
        try { vector = (Vector)JSON.deserializeStrict(value, Vector.class); }
        catch (Exception problem) { throw new SignatureException('Signature vector is not valid versioned JSON.', problem); }
        if (vector.version != 1 || vector.width != 600 || vector.height != 180 ||
            vector.paths == null || vector.paths.isEmpty() || vector.paths.size() > 24) {
            throw new SignatureException('Signature vector has an unsupported schema or stroke count.');
        }
        Decimal minX = 1000, maxX = -1000, minY = 1000, maxY = -1000;
        Integer coordinateCount = 0;
        for (String path : vector.paths) {
            if (String.isBlank(path) || path.length() > 18000 || !path.startsWith('M ') || !path.endsWith(' Z')) {
                throw new SignatureException('Signature contour is invalid.');
            }
            List<String> tokens = path.split(' ');
            Integer index = 0;
            while (index < tokens.size()) {
                String command = tokens[index++];
                if (command == 'Z' && index == tokens.size()) { break; }
                Integer count = command == 'Q' ? 4 : ((command == 'L' || (command == 'M' && index == 1)) ? 2 : 0);
                if (count == 0 || index + count >= tokens.size()) {
                    throw new SignatureException('Signature contour command is invalid.');
                }
                for (Integer coordinate = 0; coordinate < count; coordinate++) {
                    String token = tokens[index++];
                    if (!Pattern.matches('-?\\d{1,3}(\\.\\d)?', token)) {
                        throw new SignatureException('Signature contains an invalid coordinate.');
                    }
                    Decimal numberValue = Decimal.valueOf(token);
                    Boolean isX = Math.mod(coordinate, 2) == 0;
                    if (numberValue < -10 || numberValue > (isX ? 610 : 190)) {
                        throw new SignatureException('Signature is outside the permitted viewport.');
                    }
                    if (isX) { minX = Math.min(minX, numberValue); maxX = Math.max(maxX, numberValue); }
                    else { minY = Math.min(minY, numberValue); maxY = Math.max(maxY, numberValue); }
                    coordinateCount++;
                    if (coordinateCount > 6000) { throw new SignatureException('Signature is too complex.'); }
                }
            }
        }
        if (coordinateCount < 16 || maxX - minX < 20 || maxY - minY < 4) {
            throw new SignatureException('Please provide a complete signature rather than a tap or short mark.');
        }
        return vector;
    }

    /** Decodes only a bounded PNG with approved viewport dimensions. */
    public static Blob decodePng(String value) {
        if (String.isBlank(value) || value.length() > 28000 ||
            !Pattern.matches('[A-Za-z0-9+/]+={0,2}', value) || Math.mod(value.length(), 4) != 0) {
            throw new SignatureException('Signature PNG transport is missing or invalid.');
        }
        Blob image;
        try { image = EncodingUtil.base64Decode(value); }
        catch (Exception problem) { throw new SignatureException('Signature PNG cannot be decoded.', problem); }
        String hex = EncodingUtil.convertToHex(image).toLowerCase();
        if (image.size() < 70 || image.size() > 21000 || !hex.startsWith('89504e470d0a1a0a0000000d49484452') ||
            !hex.endsWith('0000000049454e44ae426082')) {
            throw new SignatureException('Signature file is not a supported PNG.');
        }
        Integer width = integerFromHex(hex.substring(32, 40));
        Integer height = integerFromHex(hex.substring(40, 48));
        if (!new Set<Integer>{600, 900, 1200}.contains(width) || height * 10 != width * 3 ||
            hex.substring(48, 52) != '0806' || hex.substring(52, 58) != '000000') {
            throw new SignatureException('Signature PNG dimensions or format are not supported.');
        }
        return image;
    }

    private static Integer integerFromHex(String hex) {
        Integer result = 0;
        for (Integer i = 0; i < hex.length(); i++) {
            Integer digit = '0123456789abcdef'.indexOf(hex.substring(i, i + 1));
            if (result > 1000000) { throw new SignatureException('PNG dimension exceeds the limit.'); }
            result = result * 16 + digit;
        }
        return result;
    }

    /** SHA-256 over the exact stored bytes. */
    public static String sha256(Blob value) {
        return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', value)).toLowerCase();
    }
}
