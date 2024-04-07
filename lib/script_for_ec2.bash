#!/bin/bash

# 1. Read the first item in the DynamoDB table
ITEM=$(aws dynamodb scan --table-name FlovusTable --max-items 1)

# 2. Store the value of the 'input_text' field in a variable
INPUT_TEXT=$(echo $ITEM | jq -r '.Items[0].input_text.S')

# 3. Store the value of the 'input_file_path' field in a variable
INPUT_FILE_PATH=$(echo $ITEM | jq -r '.Items[0].input_file_path.S')

# 4. Download the S3 object
aws s3 cp "s3://$INPUT_FILE_PATH" .

# 5. Append a colon and the value in INPUT_TEXT to the end of the file
echo ":$INPUT_TEXT" >> $(basename "$INPUT_FILE_PATH")

# 6. Rename the file to 'output_file.txt'
mv $(basename "$INPUT_FILE_PATH") output_file.txt

# 7. Upload the file to the same bucket
aws s3 cp output_file.txt "s3://flovus/output_file.txt"

# 8. Insert a record into the DynamoDB table
aws dynamodb put-item --table-name TmpFlovus \
  --item '{"output_file_path": {"S": "'$(dirname "$INPUT_FILE_PATH")'/output_file.txt"}}'