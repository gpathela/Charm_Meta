use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program::invoke,
    program_error::ProgramError,
    pubkey::Pubkey,
};

use spl_token_metadata::instruction::{create_master_edition, create_metadata_accounts};

/// Define the type of state stored in accounts
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct GreetingAccount {
    /// number of greetings
    pub counter: u32,
}

// Declare and export the program's entrypoint
entrypoint!(process_instruction);

// Program entrypoint's implementation
pub fn process_instruction(
    program_id: &Pubkey,      // Public key of the account
    accounts: &[AccountInfo], // The accounts
    data: &[u8],
) -> ProgramResult {
    msg!("Hello World Rust program entrypoint");

   
    // Iterating accounts is safer then indexing
    let accounts_iter = &mut accounts.iter();

    // Get the account to say hello to
    let account = next_account_info(accounts_iter)?;
    let payer = next_account_info(accounts_iter)?;
    let mint = next_account_info(accounts_iter)?;
    let metadata_account = next_account_info(accounts_iter)?;
    let meta_account_program = next_account_info(accounts_iter)?;
    let master_edition_account = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;
    let rent_program = next_account_info(accounts_iter)?;
    let token_program = next_account_info(accounts_iter)?;

    let creators: Vec<spl_token_metadata::state::Creator> =
        vec![spl_token_metadata::state::Creator {
            address: *payer.key,
            verified: true,
            share: 100,
        }];
    msg!("Making metadata accounts vector...");
    let metadata_infos = vec![
        metadata_account.clone(),
        master_edition_account.clone(),
        meta_account_program.clone(),
        mint.clone(),
        payer.clone(),
        system_program.clone(),
        rent_program.clone(),
        token_program.clone(),
    ];
    msg!("Making metadata instruction");
    let instruction = create_metadata_accounts(
        *meta_account_program.key,
        *metadata_account.key,
        *mint.key,
        *payer.key,
        *payer.key,
        *payer.key,
        //"Gourav's nft".to_string(),
        String::from_utf8_lossy(&data[0..20]).to_string(),
        String::from_utf8_lossy(&data[20..24]).to_string(),
        String::from_utf8_lossy(&data[24..74]).to_string(),
        Some(creators),
        20,
        true,
        true,
    );
    msg!("Calling the metadata program to make metadata...");
    invoke(&instruction, metadata_infos.as_slice())?;

    msg!("Metadata created...");

    msg!("Creating master edition");
    let instruction_create_master_edition = create_master_edition(
        *meta_account_program.key,
        *master_edition_account.key,
        *mint.key,
        *payer.key,
        *payer.key,
        *metadata_account.key,
        *payer.key,
        Some(10),
    );

    msg!("Calling the metadata program to make masteredition...");
    invoke(&instruction_create_master_edition, metadata_infos.as_slice(),)?;

    // The account must be owned by the program in order to modify its data
    if account.owner != program_id {
        msg!("Greeted account does not have the correct program id");
        return Err(ProgramError::IncorrectProgramId);
    }

    // Increment and store the number of times the account has been greeted
    let mut greeting_account = GreetingAccount::try_from_slice(&account.data.borrow())?;
    greeting_account.counter += 1;
    greeting_account.serialize(&mut &mut account.data.borrow_mut()[..])?;

    msg!("Greeted {} time(s)!", greeting_account.counter);

    Ok(())
}

// Sanity tests
#[cfg(test)]
mod test {
    use super::*;
    use solana_program::clock::Epoch;
    use std::mem;

    #[test]
    fn test_sanity() {
        let program_id = Pubkey::default();
        let key = Pubkey::default();
        let mut lamports = 0;
        let mut data = vec![0; mem::size_of::<u32>()];
        let owner = Pubkey::default();
        let account = AccountInfo::new(
            &key,
            false,
            true,
            &mut lamports,
            &mut data,
            &owner,
            false,
            Epoch::default(),
        );
        let instruction_data: Vec<u8> = Vec::new();

        let accounts = vec![account];

        assert_eq!(
            GreetingAccount::try_from_slice(&accounts[0].data.borrow())
                .unwrap()
                .counter,
            0
        );
        process_instruction(&program_id, &accounts, &instruction_data).unwrap();
        assert_eq!(
            GreetingAccount::try_from_slice(&accounts[0].data.borrow())
                .unwrap()
                .counter,
            1
        );
        process_instruction(&program_id, &accounts, &instruction_data).unwrap();
        assert_eq!(
            GreetingAccount::try_from_slice(&accounts[0].data.borrow())
                .unwrap()
                .counter,
            2
        );
    }
}
